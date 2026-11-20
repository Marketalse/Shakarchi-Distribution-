import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { db } from '../lib/db'
import { supabase } from '../lib/supabase'
import { formatUsd, sumUsd, multiplyUsd, usdCents, usdAmount } from '../lib/money'
import { soloApi, operation } from '../lib/solo-api'
import { openSharedVisit } from '../lib/shared-visit'
import { ClientEdit, DynamicSurvey } from './CaptureForms'
import { ClientLocation } from './ClientLocation'
import { currentReport, type Balance, type CashEntry, type Reminder } from '../lib/reporting'
import type { Outlet } from '../lib/types'

type CatalogItem = {
  id: string; brand: string | null; sku: string | null; product_line: string
  flavour: string; wholesale_price: number
}
type Invoice = {
  id: string; outlet_id: string; next_visit: string | null
  total: number; investment: number | null; payment_status: string
}
type SkuSales = { id: string; brand: string; sku: string; total: number }

const money = formatUsd
const sum = sumUsd
const brandOf = (item: CatalogItem) => item.brand ?? item.product_line
const skuOf = (item: CatalogItem) => item.sku ? item.sku + ' · ' + item.flavour : item.flavour
const message = (error: unknown) =>
  error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error)

async function rows<T>(table: string, columns: string, outletId?: string, key = 'id'): Promise<T[]> {
  if (!supabase) throw new Error('Connect Supabase to load this page.')
  const result: T[] = []
  for (let offset = 0; ; offset += 500) {
    let query = supabase.from(table).select(columns).order(key).range(offset, offset + 499)
    if (outletId) query = query.eq('outlet_id', outletId)
    const { data, error } = await query
    if (error) throw error
    result.push(...((data ?? []) as T[]))
    if (!data || data.length < 500) return result
  }
}

function useRows<T>(loader: () => Promise<T>, key: string) {
  const [state, setState] = useState<{ key: string; data?: T; error?: string }>({ key })
  useEffect(() => {
    let current = true
    void loader().then(
      (data) => { if (current) setState({ key, data }) },
      (error: unknown) => { if (current) setState({ key, error: message(error) }) },
    )
    return () => { current = false }
    // The key identifies the query and any refresh after submission.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return state.key === key ? state : { key }
}

export function RetailDetail({ version }: { version: number }) {
  const { outletId } = useParams()
  const [tab, setTab] = useState('Summary')
  const [visitId, setVisitId] = useState('')
  const [visitError, setVisitError] = useState('')
  const [visitBusy, setVisitBusy] = useState(false)
  useEffect(() => {
    if (!outletId || (tab === 'Summary' || tab === 'Profile') || !supabase) return
    let active = true
    setVisitBusy(true)
    void openSharedVisit(supabase, outletId, tab === 'Order' ? 'order' : 'survey').then(
      id => { if (active) { setVisitId(id); setVisitError(''); setVisitBusy(false) } },
      error => { if (active) { setVisitError(message(error)); setVisitBusy(false) } },
    )
    return () => { active = false }
  }, [outletId, tab])
  async function finishVisit() {
    if (!supabase || !visitId || visitBusy) return
    setVisitBusy(true)
    try {
      await soloApi(supabase).finishVisit(operation({ visit_id: visitId }))
      setVisitId(''); setTab('Summary'); setRevision(value => value + 1)
    } catch (failure) { setVisitError(message(failure)) }
    finally { setVisitBusy(false) }
  }
  const [revision, setRevision] = useState(0)
  const { data: retail } = useRows(
    () => outletId ? db.outlets.get(outletId) : Promise.resolve(undefined),
    String(outletId) + ':' + version + ':' + revision,
  )
  if (!outletId || !retail) return <main><Link to="/">Retail list</Link><p>Retail details are unavailable.</p></main>

  return (
    <main>
      <Link to="/">Retail list</Link>
      <h1>{retail.retail_name}</h1>
      <ClientLocation retail={retail} allowCorrection onUpdated={() => setRevision(value => value + 1)} />
      <nav className="retail-tabs" aria-label="Retail actions">
        {['Summary', 'Profile', 'Order', 'Survey', 'Survey forms'].map((label) =>
          <button key={label} aria-pressed={label === tab} onClick={() => setTab(label)}>{label}</button>)}
      </nav>
      {tab === 'Profile' && <ClientEdit retail={retail} onSaved={() => setRevision(value => value + 1)} />}
      {tab === 'Survey forms' && visitId && !visitBusy && !visitError && <DynamicSurvey outletId={outletId} visitId={visitId} />}
      {tab === 'Summary' && <Summary retail={retail} revision={revision} />}
      {visitBusy && <p role="status">Loading visit…</p>}
      {visitError && <p className="error" role="alert">{visitError}</p>}
      {visitId && <button disabled={visitBusy} onClick={() => void finishVisit()}>Finish this visit</button>}
      {tab === 'Order' && visitId && !visitBusy && !visitError && <OrderForm key={outletId} outletId={outletId} visitId={visitId} onSaved={() => setRevision(revision + 1)} />}
      {tab === 'Survey' && visitId && !visitBusy && !visitError && <SurveyForm key={outletId} outletId={outletId} visitId={visitId} />}
    </main>
  )
}

function Summary({ retail, revision }: { retail: Outlet; revision: number }) {
  const { data, error } = useRows(
    () => rows<Invoice>('basic_invoice_totals', 'id,outlet_id,next_visit,total,investment,payment_status', retail.id),
    retail.id + ':' + revision,
  )
  const [today] = useState(() => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Baghdad', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date()))
  const reminder = data?.flatMap(({next_visit}) => next_visit && next_visit >= today ? [next_visit] : []).sort()[0]
  return <>
    <dl className="metrics">
      <div><dt>Location</dt><dd>{retail.address || [retail.area, retail.province].join(', ')}</dd></div>
      <div><dt>Total sales</dt><dd>{data ? money(sum(data.map(x => x.total))) : '—'}</dd></div>
      <div><dt>Cost of goods · known snapshots</dt><dd>{data?.some(x => x.investment === null)
        ? 'Cost data incomplete' : data ? money(sum(data.map(x => x.investment ?? 0))) : '—'}</dd></div>
      <div><dt>Next visit</dt><dd>{reminder ?? (data ? 'No upcoming visit' : '—')}</dd></div>
    </dl>
    {error ? <p className="error" role="alert">{error}</p> : !data && <p role="status">Loading summary…</p>}
  </>
}

function OrderForm({ outletId, visitId, onSaved }: { outletId: string; visitId: string; onSaved: () => void }) {
  const [revision, setRevision] = useState(0)
  const catalog = useRows(async () => {
    if (!supabase) throw new Error('Connect Supabase to load the catalog.')
    const { data, error } = await supabase.from('solo_active_catalog')
      .select('id,brand,sku,product_line,flavour,wholesale_price')
      .eq('active', true).eq('currency', 'USD').order('product_line').order('flavour')
    if (error) throw error
    return data as CatalogItem[]
  }, String(revision))
  const [brand, setBrand] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const [payment, setPayment] = useState('Unpaid')
  const [savedInvoice, setSavedInvoice] = useState('')
  const [lines, setLines] = useState<Record<string, number>>({})
  const [terms, setTerms] = useState('0')
  const [nextVisit, setNextVisit] = useState('')
  const [initialReceipt, setInitialReceipt] = useState('0')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const pendingKey = 'wsd-pending-invoice:' + outletId
  type Attempt = { key: string; id: string } | null
  const [pendingAttempt, setPendingAttempt] = useState<Attempt>(() => {
    try { return JSON.parse(localStorage.getItem(pendingKey) || sessionStorage.getItem(pendingKey) || 'null') }
    catch { return null }
  })
  const attempt = useRef<Attempt>(pendingAttempt)
  const brands = [...new Set(catalog.data?.map(brandOf))].sort()
  const selected = catalog.data?.filter(i => lines[i.id] > 0) ?? []
  const total = sum(selected.map(i => multiplyUsd(i.wholesale_price, lines[i.id])))
  let partialBalance: string | undefined
  try { partialBalance = usdAmount(usdCents(total) - usdCents(initialReceipt || '0')) }
  catch { partialBalance = undefined }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase || busy || (selected.length === 0 && !attempt.current)) return
    setBusy(true)
    setError('')
    setSuccess('')
    const items = selected.map(i => ({ sku_id: i.id, quantity: lines[i.id], price: i.wholesale_price }))
    const receipt = payment === 'Paid' ? String(total) : payment === 'Unpaid' ? '0' : initialReceipt
    let initialAmount: bigint
    try { initialAmount = usdCents(receipt) }
    catch { setError('Enter a USD amount with at most two decimal places.'); setBusy(false); return }
    if (!attempt.current && (initialAmount < 0n || initialAmount > usdCents(total) || (payment === 'Partial' && (initialAmount === 0n || initialAmount >= usdCents(total))))) {
      setError('Enter an initial receipt from zero to the invoice total, with at most two decimal places.')
      setBusy(false)
      return
    }
    const key = JSON.stringify([items, terms, nextVisit, receipt])
    if (!attempt.current) attempt.current = { key, id: crypto.randomUUID() }
    setPendingAttempt(attempt.current)
    const [savedItems, savedTerms, savedNextVisit, savedReceipt] = JSON.parse(attempt.current.key) as [
      { sku_id: string; quantity: number; price: number }[], string, string, string,
    ]
    try {
      localStorage.setItem(pendingKey, JSON.stringify(attempt.current))
      const result = await soloApi(supabase).issueInvoice({
        id: attempt.current.id,
        request: {
          currency: 'USD', outlet_id: outletId, visit_id: visitId,
          items: savedItems.map(item => ({ ...item, price: String(item.price) })),
          terms_days: Number(savedTerms),
          next_visit: savedNextVisit || undefined,
          initial_amount: savedReceipt,
          method: 'cash',
        },
      })
      setSuccess('Invoice #' + result.invoice_no + ' created.')
      setSavedInvoice(result.order_id)
      setReviewing(false)
      setLines({})
      setNextVisit('')
      setInitialReceipt('0')
      attempt.current = null
      setPendingAttempt(null)
      localStorage.removeItem(pendingKey); sessionStorage.removeItem(pendingKey)
      onSaved()
    } catch (failure) {
      const code = (failure as Error & { code?: string }).code
      if (code && /^(P000[12]|22|23|42501)/.test(code)) {
        attempt.current = null
        setPendingAttempt(null)
        localStorage.removeItem(pendingKey); sessionStorage.removeItem(pendingKey)
      }
      setError(message(failure))
    } finally {
      setBusy(false)
    }
  }

  return <form className="form" onSubmit={(e) => void submit(e)}>
    <fieldset disabled={busy} className="form retail-fields">
      {reviewing ? <>
        <button className="link" type="button" onClick={() => setReviewing(false)}>Back to products</button>
        <section className="card">
          <h2>Review order</h2>
          {selected.map(item => <div className="summary-line" key={item.id}>
            <span>{skuOf(item)} × {lines[item.id]}</span><strong>{money(multiplyUsd(item.wholesale_price, lines[item.id]))}</strong>
          </div>)}
          <div className="summary-line"><strong>Total</strong><strong>{money(total)}</strong></div>
        </section>
        <nav className="retail-tabs" aria-label="Initial payment">
          {['Paid', 'Partial', 'Unpaid'].map(value => <button type="button" key={value}
            aria-pressed={payment === value} onClick={() => setPayment(value)}>{value}</button>)}
        </nav>
        {payment === 'Partial' && <label>Collected amount · USD<input type="number" min="0.01" max={total}
          step="0.01" required value={initialReceipt} onChange={e => setInitialReceipt(e.target.value)} /></label>}
        <div className="card summary-line"><span>Remaining balance</span>
          <strong>{payment === 'Paid' ? money('0') : payment === 'Unpaid' ? money(total) : partialBalance === undefined ? '—' : money(partialBalance)}</strong></div>
        <label>Invoice due date<select value={terms} onChange={e => setTerms(e.target.value)}>
          <option value="0">Due today</option>
          {[7, 14, 30, 60].map(days => <option key={days} value={days}>In {days} days</option>)}
        </select></label>
        <p className="muted">{payment === 'Paid' ? 'Paid invoices need no collection reminder.' : 'A collection reminder is set for four days.'}</p>
        <label>Next visit<input type="date" value={nextVisit} onChange={e => setNextVisit(e.target.value)} /></label>
        <button className="primary" disabled={selected.length === 0 && !pendingAttempt}>
          {busy ? 'Creating invoice…' : 'Submit and create invoice'}
        </button>
      </> : <>
        <nav className="retail-tabs" aria-label="Catalog brand">
          <button type="button" aria-pressed={!brand} onClick={() => setBrand('')}>All</button>
          {brands.map(value => <button type="button" key={value} aria-pressed={brand === value}
            onClick={() => setBrand(value)}>{value}</button>)}
        </nav>
        {catalog.data?.filter(item => !brand || brandOf(item) === brand).map(item => <div className="card sku-row" key={item.id}>
          <img src="/wireframe/sku.svg" width="30" height="30" alt="" />
          <div className="sku-info"><strong>{skuOf(item)}</strong><p>{brandOf(item)}</p><p>{money(item.wholesale_price)} / unit</p></div>
          <div className="stepper">
            <button type="button" aria-label={'Decrease ' + skuOf(item)} disabled={!lines[item.id]}
              onClick={() => setLines(current => ({ ...current, [item.id]: Math.max(0, (current[item.id] || 0) - 1) }))}>−</button>
            <output aria-label={skuOf(item) + ' quantity'}>{lines[item.id] || 0}</output>
            <button type="button" className="primary" aria-label={'Increase ' + skuOf(item)} disabled={lines[item.id] >= 100000}
              onClick={() => setLines(current => ({ ...current, [item.id]: (current[item.id] || 0) + 1 }))}>+</button>
          </div>
        </div>)}
        {catalog.data && catalog.data.length > 0 && <div className="cart-total"><div><small className="muted">{selected.length} SKUs</small><br /><strong>{money(total)}</strong></div>
          <button type="button" className="primary" disabled={!selected.length} onClick={() => setReviewing(true)}>Review</button></div>}
      </>}
      {pendingAttempt && <div className="card"><p>A saved invoice is waiting for confirmation.</p>
        <button className="primary">{busy ? 'Retrying…' : 'Retry saved invoice'}</button></div>}
    </fieldset>
    {!catalog.data && !catalog.error && <p role="status">Loading products…</p>}
    {catalog.error && <p className="error" role="alert">{catalog.error}</p>}
    {catalog.data?.length === 0 && <div className="empty"><h2>Your catalog is empty</h2><p>Add products before taking an order.</p><Link className="button" to="/admin">Manage catalog</Link></div>}
    {error && <><p className="error" role="alert">{error}</p>
      <button type="button" disabled={busy} onClick={() => setRevision(revision + 1)}>Reload catalog</button></>}
    {success && <section className="card"><p className="ok-text" role="status">{success}</p>
      <Link className="button primary" to="/orders">View invoices</Link>
      <Link className="button" to={'/admin?invoice=' + savedInvoice}>Collections and reminders</Link></section>}
  </form>
}

function SurveyForm({ outletId, visitId }: { outletId: string; visitId: string }) {
  const [brandId, setBrandId] = useState('')
  const [productId, setProductId] = useState('')
  const competitors = useRows(async () => {
    if (!supabase) throw Error('The database connection is unavailable.')
    const [brands, products] = await Promise.all([
      supabase.from('survey_brands').select('id,name').eq('is_own', false).eq('active', true).order('name'),
      supabase.from('solo_competitor_catalog').select('id,brand_id,product_line,flavour').order('product_line'),
    ])
    if (brands.error) throw brands.error
    if (products.error) throw products.error
    return { brands: brands.data, products: products.data }
  }, 'competitor-definitions')

  const [kind, setKind] = useState('competitor_price')
  const [photo, setPhoto] = useState<File>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const retry = useRef<{ id: string; photo?: File; uploaded: boolean; key: string } | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || busy) return
    const form = event.currentTarget
    const values = new FormData(form)
    const value = (name: string) => String(values.get(name) ?? '').trim()
    const promotion = kind === 'promotion'
    const fields = {
      currency: 'USD', outlet_id: outletId, visit_id: visitId, kind, brand_id: brandId, product_id: productId,
      brand: competitors.data?.brands.find(item => item.id === brandId)?.name ?? '',
      model: competitors.data?.products.find(item => item.id === productId)?.product_line ?? '',
      price: promotion ? null : Number(value('price')), offer: promotion ? value('offer') : null,
      available: value('available') ? value('available') === 'true' : null,
      facings: value('facings') ? Number(value('facings')) : null,
      shelf_width_cm: value('shelf_width_cm') ? Number(value('shelf_width_cm')) : null,
    }
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) throw authError ?? new Error('Sign in again.')
      const attachment = promotion ? photo : undefined
      if (attachment && (!['image/jpeg', 'image/png', 'image/webp'].includes(attachment.type) || attachment.size > 5242880)) {
        throw new Error('Choose a JPEG, PNG or WebP photo up to 5 MB.')
      }
      const key = JSON.stringify(fields)
      if (!retry.current || retry.current.key !== key || retry.current.photo !== attachment) {
        if (retry.current?.uploaded) {
          await supabase.storage.from('market-surveys').remove([user.id + '/' + retry.current.id])
        }
        retry.current = { id: crypto.randomUUID(), uploaded: false, key, photo: attachment }
      }
      const attempt = retry.current
      const path = attachment ? user.id + '/' + attempt.id : null
      if (attachment && path && !attempt.uploaded) {
        const { error: uploadError } = await supabase.storage.from('market-surveys').upload(path, attachment)
        if (uploadError && String((uploadError as { statusCode?: string }).statusCode) !== '409') throw uploadError
        attempt.uploaded = true
      }
      await soloApi(supabase).submitObservation({ id: attempt.id, request: { ...fields, price: fields.price === null ? null : value('price'), photo_path: path } })
      form.reset()
      setKind('competitor_price')
      setPhoto(undefined)
      retry.current = null
      setSuccess('Survey saved.')
      setProductId('')
    } catch (failure) {
      setError(message(failure))
    } finally {
      setBusy(false)
    }
  }

  return <form className="form" onSubmit={(e) => void submit(e)}>
    <fieldset disabled={busy} className="form retail-fields">
      <label>Availability<select name="available"><option value="">Unknown</option><option value="true">Available</option><option value="false">Unavailable</option></select></label>
      <label>Facings<input name="facings" type="number" min="0" step="1" /></label>
      <label>Shelf width · cm<input name="shelf_width_cm" type="number" min="0" step="0.01" /></label>

      <label>Survey type<select value={kind} onChange={e => { setKind(e.target.value); setPhoto(undefined) }}>
        <option value="competitor_price">Competitor price</option>
        <option value="new_brand">New brand</option>
        <option value="promotion">Current promotion</option>
      </select></label>
      <label>Competitor brand<select required value={brandId} onChange={e => { setBrandId(e.target.value); setProductId('') }}>
        <option value="">Choose competitor</option>
        {competitors.data?.brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
      </select></label>
      <label>Competitor product<select required value={productId} onChange={e => setProductId(e.target.value)}>
        <option value="">Choose product</option>
        {competitors.data?.products.filter(product => product.brand_id === brandId).map(product =>
          <option key={product.id} value={product.id}>{product.product_line} · {product.flavour}</option>)}
      </select></label>
      {competitors.error && <p className="error" role="alert">{competitors.error}</p>}
      {competitors.data?.brands.length === 0 && <p className="muted">Add approved competitor definitions in owner tools before surveying.</p>}
      {kind === 'promotion' ? <>
        <label>Offer<input name="offer" required maxLength={1000} /></label>
        <label>Offer photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setPhoto(e.target.files?.[0])} /></label>
      </> : <label>Price in USD<input name="price" type="number" required min="0" step="0.01" /></label>}
      <button className="primary">{busy ? 'Submitting…' : 'Submit survey'}</button>
    </fieldset>
    {error && <p className="error" role="alert">{error}</p>}
    {success && <p className="ok-text" role="status">{success}</p>}
  </form>
}

export function Dashboard({ version = 0 }: { version?: number }) {
  const [breakdown, setBreakdown] = useState('Brand')
  const [refresh, setRefresh] = useState(0)
  const [clock, setClock] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 30000)
    const focused = () => setRefresh(v => v + 1)
    window.addEventListener('focus', focused)
    return () => { clearInterval(timer); window.removeEventListener('focus', focused) }
  }, [])
  const { data, error } = useRows(async () => {
    if (!supabase) throw new Error('Connect Supabase to load the dashboard.')
    const [outlets, invoices, skus, cash, reminders, rates, costs] = await Promise.all([
      supabase.from('outlets').select('id', { count: 'exact', head: true }),
      rows<Balance>('solo_invoice_balances', 'id,invoice_no,outlet_id,total,collected,outstanding,overpayment,due_date,payment_status,recipient_snapshot'),
      rows<SkuSales>('basic_sku_sales', 'id,brand,sku,total'),
      rows<CashEntry>('payments', 'id,order_id,amount'),
      rows<Reminder>('collection_reminders', 'order_id,status,scheduled_at', undefined, 'order_id'),
      rows<{id:string;version:number;exchange_rate_used:string;rate_source:string;valid_until:string}>('fx_rate_versions','id,version,exchange_rate_used,rate_source,valid_until'),
      rows<Invoice>('basic_invoice_totals','id,total,investment,payment_status'),
    ])
    if (outlets.error) throw outlets.error
    currentReport(invoices,cash,reminders,new Date()) // Validate unique financial identities before showing results.
    return { retails: outlets.count ?? 0, invoices, skus, cash, reminders, rates, costs, loadedAt: new Date().toISOString() }
  }, 'dashboard:' + version + ':' + refresh)
  if (error) return <main><h1>Dashboard</h1><p className="error" role="alert">{error}</p></main>
  if (!data) return <main><h1>Dashboard</h1><p role="status">Loading dashboard…</p></main>
  const report = currentReport(data.invoices,data.cash,data.reminders,new Date(clock))
  const rate = [...data.rates].sort((a,b) => b.version-a.version)[0]
  const missingCosts = data.costs.filter(i => i.investment == null).length
  const brands = new Map<string, SkuSales[]>()
  for (const sku of data.skus) {
    const group = brands.get(sku.brand)
    if (group) group.push(sku)
    else brands.set(sku.brand, [sku])
  }

  return <main>
    <h1>Dashboard</h1>
    <p className="muted">All-time USD totals · Current balances. Updated {new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Baghdad',dateStyle:'medium',timeStyle:'short'}).format(new Date(data.loadedAt))} · Baghdad time</p>
    <button onClick={() => { setClock(Date.now()); setRefresh(v => v + 1) }}>Refresh report</button>
    <dl className="metrics">
      <div><dt>Total sales</dt><dd>{money(report.sales)}</dd></div>
      <div><dt>Net cash collected</dt><dd>{money(report.netCash)}</dd></div>
      <div><dt>Still to collect</dt><dd>{money(report.outstanding)}</dd></div>
      <div><dt>Overpayments</dt><dd>{money(report.overpayment)}</dd></div>
      <div><dt>Overdue invoices</dt><dd>{money(report.overdue)}</dd></div>
      <div><dt>Total retails</dt><dd>{data.retails}</dd></div>
      {['Paid', 'Partially paid', 'Unpaid'].map(status =>
        <div key={status}><dt>{status} invoices</dt><dd>{data.invoices.filter(i => i.payment_status === status).length}</dd></div>)}
    </dl>
    {report.discrepancy !== '0.00' && <p className="error" role="alert">Payment totals need reconciliation: {money(report.discrepancy)} difference. Refresh before using this report.</p>}
    {report.unallocatedCash !== '0.00' && <p className="warn-text">Cash not matched to listed invoices: {money(report.unallocatedCash)}. Included in net cash, kept separate from invoice balances.</p>}
    {report.unknownAging !== '0.00' && <p className="warn-text">Balance without a due date: {money(report.unknownAging)}. Not counted as overdue.</p>}
    {missingCosts > 0 && <p className="warn-text">{missingCosts} invoices have incomplete cost snapshots. Complete profit reporting is unavailable.</p>}
    <section className="card" aria-label="Due payment reminders">
      <h2>Payments to follow up · {report.due.length}</h2>
      <p>Unpaid and partly paid invoices get a reminder after four days. Collect the balance or choose another reminder time.</p>
      {!report.due.length && <p>No payment reminders due.</p>}
      <ul>{report.due.map(({invoice,scheduled_at}) => <li key={invoice.id}>
        <strong>{invoice.recipient_snapshot?.name || 'Invoice #' + invoice.invoice_no}</strong> · #{invoice.invoice_no} · {money(invoice.outstanding)} remaining
        <p>Reminder: {new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Baghdad',dateStyle:'medium',timeStyle:'short'}).format(new Date(scheduled_at!))}</p>
        <Link className="button" to={'/admin?invoice=' + invoice.id}>Collect or set next reminder</Link>
      </li>)}</ul>
      <p className="muted">Reminders appear in the app. No push or email notifications.</p>
    </section>
    <section className="card"><h2>Parallel exchange rate</h2>
      <p>{rate ? rate.exchange_rate_used + ' IQD per $1 · ' + rate.rate_source + (new Date(rate.valid_until).getTime() <= clock ? ' · Expired' : ' · Active') : 'No manual rate entered. USD payments remain available.'}</p>
      <Link to="/admin">Manage rate in owner tools</Link>
    </section>
    <section className="card">
      <div className="row"><h2>Sales by</h2><nav className="retail-tabs" aria-label="Sales breakdown">
        {['Brand', 'SKU'].map(value => <button key={value} aria-pressed={breakdown === value} onClick={() => setBreakdown(value)}>{value}</button>)}
      </nav></div>
      <p className="muted">All recorded sales</p>
      {brands.size === 0 && <p className="empty">Your first sale will appear here.</p>}
      {(breakdown === 'Brand'
        ? [...brands.entries()].map(([brand, skus]) => ({ id: brand, label: brand, total: sum(skus.map(i => i.total)) }))
        : data.skus.map(sku => ({ id: sku.id, label: sku.sku, total: sku.total })))
        .sort((a, b) => Number(b.total) - Number(a.total)).map((item, _, all) => <div className="chart-row" key={item.id}>
          <div className="chart-label"><span>{item.label}</span><strong>{money(item.total)}</strong></div>
          <div className="track"><span style={{ width: Math.max(0, Math.min(100, Number(all[0].total) > 0 ? Number(item.total) / Number(all[0].total) * 100 : 0)) + '%' }} /></div>
        </div>)}
    </section>
    <Link className="card card-link" to="/orders"><span><strong>Payments</strong><br /><small className="muted">Invoices, collections and remaining balances</small></span><span aria-hidden="true">→</span></Link>
  </main>
}
