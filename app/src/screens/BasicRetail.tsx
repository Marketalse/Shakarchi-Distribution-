import {InvoicePdfActions} from './InvoicePdfActions'
import {catalogMode} from '../lib/catalog-display'
import {ProductImage} from './ProductImage'
import {VisitWorkspace} from './VisitWorkspace'
import {liveQuery} from 'dexie'
import {fieldCatalog} from '../lib/catalog'
import {stagePhoto} from '../lib/attachments'
import {fieldTable,offlineOwner,cachedFieldRead} from '../lib/offline'
import {openCaptureSession,requestCaptureFinish} from '../lib/capture-store'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { db } from '../lib/db'
import { supabase } from '../lib/supabase'
import { formatUsd, formatUsdSummary, formatIqdRate, sumUsd, usdCents } from '../lib/money'
import { packTotal, packBreakdown } from '../lib/pack'
import { CREDIT_DAYS, checkoutBalance, validTerms } from '../lib/checkout'
import { soloApi } from '../lib/solo-api'
import { DynamicSurvey } from './CaptureForms'
import { ClientOverdue } from './ClientOverdue'
import { MobileIcon } from './MobileIcon'
import { StoreNavigation } from './StoreNavigation'
import { currentReport, baghdadDay, type Balance, type CashEntry, type Reminder } from '../lib/reporting'
import type { Outlet } from '../lib/types'

type CatalogItem = {
  id: string; brand: string | null; sku: string | null; product_line: string
  flavour: string; image_path?:string|null; selling_price: number; items_per_half_pack: number; packs_per_box: number
}
type Invoice = {
  id: string; outlet_id: string; next_visit: string | null
  total: number; investment: number | null; payment_status: string
}
type SkuSales = { id: string; brand: string; sku: string; total: number }

const money = formatUsd
const sum = sumUsd
const brandOf = (item: CatalogItem) => item.brand ?? item.product_line
const skuOf = (item: CatalogItem) => item.flavour || item.product_line
const message = (error: unknown) =>
  error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error)

async function rows<T>(table: string, columns: string, outletId?: string, key = 'id'): Promise<T[]> {
  if (!supabase) throw new Error('Connect Supabase to load this page.')
  {const cached=await fieldTable<T & {outlet_id?:string}>(db,table);if(cached)return (outletId?cached.filter(r=>r.outlet_id===outletId):cached) as T[]}
  return cachedFieldRead(db,JSON.stringify([table,columns,outletId,key]),async()=>{
  const result: T[] = []
  for (let offset = 0; ; offset += 500) {
    let query = supabase!.from(table).select(columns).order(key).range(offset, offset + 499)
    if (outletId) query = query.eq('outlet_id', outletId)
    const { data, error } = await query
    if (error) throw error
    result.push(...((data ?? []) as T[]))
    if (!data || data.length < 500) return result
  }
  })
}

function useRows<T>(loader: () => Promise<T>, key: string, identity=key) {
  const [state, setState] = useState<{ key: string; identity:string; data?: T; error?: string }>({ key,identity })
  useEffect(() => {
    let current = true
    void loader().then(
      (data) => { if (current) setState({ key, identity, data }) },
      (error: unknown) => { if (current) setState(previous=>({ key,identity,data:previous.identity===identity?previous.data:undefined,error:message(error) })) },
    )
    return () => { current = false }
    // The key identifies the query and any refresh after submission.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key,identity])
  return state.identity === identity ? state : { key,identity }
}

export function RetailDetail({ version, ownerId, onCaptureChanged, onSyncRequested }: { version: number; ownerId: string; onCaptureChanged: () => void; onSyncRequested: () => Promise<void> }) {
  const { outletId } = useParams()
  const [routeParams]=useSearchParams()
  const [tab, setTab] = useState(routeParams.get('action')==='order'?'Order':'Summary')
  const [confirmation,setConfirmation]=useState<{id:string;number:number}>()
  const [visitId, setVisitId] = useState('')
  const [visitError, setVisitError] = useState('')
  const [visitBusy, setVisitBusy] = useState(false)
  useEffect(() => {
    if (!outletId || ['Summary','Profile','Survey forms','Payments'].includes(tab) || !supabase) return
    let active = true
    setVisitBusy(true)
    void openCaptureSession(db,ownerId,outletId,tab === 'Order' ? 'order' : 'survey').then(
      session => { if (active) { setVisitId(session.id); setVisitError(''); setVisitBusy(false) } },
      error => { if (active) { setVisitError(message(error)); setVisitBusy(false) } },
    )
    return () => { active = false }
  }, [outletId, tab,ownerId])
  async function finishVisit() {
    if (!supabase || !visitId || visitBusy) return
    setVisitBusy(true)
    try {
      const draft=await db.local_meta.get(`order-draft:${ownerId}:${outletId}`)
      const pending=await db.local_meta.get(`order-pending:${ownerId}:${outletId}`)
      if(draft && !pending && Object.values(JSON.parse(draft.value).lines??{}).some(q=>Number(q)>0))throw Error('Submit or remove the saved order draft before finishing this visit.')
      await requestCaptureFinish(db,ownerId,visitId)
      if(navigator.onLine)void onSyncRequested()
      setVisitId(''); setTab('Summary'); setRevision(value => value + 1)
    } catch (failure) { setVisitError(message(failure)) }
    finally { setVisitBusy(false) }
  }
  const [revision, setRevision] = useState(0)
  const { data: retail } = useRows(
    () => outletId ? db.outlets.get(outletId) : Promise.resolve(undefined),
    String(outletId) + ':' + version + ':' + revision,
    String(outletId),
  )
  const orderConfirmed=useCallback((invoice:{order_id:string;invoice_no:number})=>{setConfirmation({id:invoice.order_id,number:invoice.invoice_no});setRevision(n=>n+1);setTab('Survey forms')},[])
  if (!outletId || !retail) return <main><Link to="/">Retail list</Link><p>Retail details are unavailable.</p></main>

  return (
    <main className={tab === 'Order' ? 'retail-detail order-detail' : 'retail-detail'}>
      <div className="detail-heading">{tab !== 'Summary' && <button className="link" onClick={() => setTab('Summary')}>← Retail details</button>}<Link to="/">All stores</Link></div>
      <section className="card client-heading" hidden={tab === 'Order'}><span className="client-avatar"><MobileIcon name="shop" /></span><div><h1>{retail.retail_name}</h1><p className="muted">{retail.area}</p></div><StoreNavigation retail={retail} disclosure /></section>
      <nav className="retail-tabs" aria-label="Retail actions">
        {['Summary', 'Order', 'Payments', 'Survey forms', 'Profile', 'Survey'].map((label) =>
          <button key={label} aria-pressed={label === tab} onClick={() => setTab(label)}>{label === 'Summary' ? 'Visit workspace' : label}</button>)}
      </nav>
      {confirmation&&<section className="card order-confirmation"><p role="status">✓ Thank you! Order #{confirmation.number} submitted.</p><p className="muted">Continue with the customer survey below.</p><InvoicePdfActions invoiceId={confirmation.id}/><Link to={'/orders?invoice='+confirmation.id}>View invoice</Link><button className="link" onClick={()=>setConfirmation(undefined)}>Dismiss</button></section>}
      {tab === 'Profile' && <><ClientOverdue retailName={retail.retail_name} outletId={outletId} revision={revision+version}/><section className="card"><h2>Client profile</h2><p>{retail.owner_name || 'Owner name not recorded'}</p><p>{retail.owner_phone || 'Owner phone not recorded'}</p><p>{[retail.area,retail.province].join(', ')}</p><Link to={'/admin/clients/'+retail.id}>Edit in admin hub</Link></section></>}
      {tab === 'Survey forms' && <DynamicSurvey outletId={outletId} ownerId={ownerId} onChanged={onCaptureChanged} onSyncRequested={onSyncRequested} />}
      {tab === 'Summary' && <><VisitWorkspace retail={retail} ownerId={ownerId} version={version+revision} onOrder={()=>setTab('Order')} onSurvey={()=>setTab('Survey forms')}/><details className="retail-disclosure"><summary>Store details & full invoice history <span>⌄</span></summary><Summary key={version+':'+revision} retail={retail} revision={revision}/></details></>}
      {tab === 'Payments' && <VisitWorkspace retail={retail} ownerId={ownerId} version={version+revision} onOrder={()=>setTab('Order')} onSurvey={()=>setTab('Survey forms')} paymentsOnly/>}
      {['Order','Survey'].includes(tab) && visitBusy && <p role="status">Loading visit…</p>}
      {['Order','Survey'].includes(tab) && visitError && <p className="error" role="alert">{visitError}</p>}
      {tab === 'Order' && visitId && !visitBusy && !visitError && <OrderForm key={outletId} ownerId={ownerId} cacheVersion={version} outletId={outletId} visitId={visitId} onSaved={orderConfirmed} />}
      {tab === 'Survey' && visitId && !visitBusy && !visitError && <SurveyForm key={outletId} outletId={outletId} visitId={visitId} />}
      {['Order','Survey'].includes(tab) && visitId && <button disabled={visitBusy} onClick={() => void finishVisit()}>Finish this visit</button>}
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
    <h2>Store Details</h2><dl className="metrics store-details">
      <div><dt>Location</dt><dd>{retail.address || [retail.area, retail.province].join(', ')}</dd></div>
      <div><dt>Next visit</dt><dd>{reminder ?? (data ? 'No upcoming visit' : '—')}</dd></div>
    </dl>
    {error ? <p className="error" role="alert">{error}</p> : !data && <p role="status">Loading summary…</p>}
    <details className="retail-disclosure"><summary>Financial Overview <span>⌄</span></summary><ClientOverdue retailName={retail.retail_name} outletId={retail.id} revision={revision}/></details>
    <ClientInvoiceHistory outletId={retail.id} revision={revision}/>
  </>
}

function ClientInvoiceHistory({outletId,revision}:{outletId:string;revision:number}) {
  const {data,error}=useRows(()=>rows<{id:string;created_at:string;total:string}>('solo_invoice_balances','id,outlet_id,created_at,total',outletId),'client-invoices:'+outletId+':'+revision)
  return <section className="card journey-card"><h2>Customer Journey</h2><p className="muted">Recent invoices</p>{error?<p role="alert">{error}</p>:!data?<p role="status">Loading invoices…</p>:!data.length?<p>No invoices yet.</p>:<table className="invoice-summary"><thead><tr><th>Invoice date</th><th>Invoice amount</th></tr></thead><tbody>{[...data].sort((a,b)=>b.created_at.localeCompare(a.created_at)).map(row=><tr key={row.id}><td>{new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Baghdad',dateStyle:'medium'}).format(new Date(row.created_at))}</td><td><Link to={'/orders?invoice='+row.id} aria-label={'Open invoice details for '+new Date(row.created_at).toLocaleDateString('en-GB')}>{money(row.total)}</Link></td></tr>)}</tbody></table>}</section>
}

export function OrderForm({ outletId, visitId, onSaved,ownerId,cacheVersion }: { outletId: string; visitId: string; onSaved: (invoice:{order_id:string;invoice_no:number}) => void; ownerId:string;cacheVersion:number }) {
  const [revision, setRevision] = useState(0)
  const catalog = useRows(()=>fieldCatalog(db,supabase),`${revision}:${cacheVersion}`,'catalog')
  const [brand, setBrand] = useState('')
  const [productLine,setProductLine]=useState('')
  const [mode,setMode]=useState('')
  const [layout,setLayout]=useState<'list'|'grid'>(()=>{try{return localStorage.getItem('catalog-layout')==='grid'?'grid':'list'}catch{return 'list'}})
  const [search,setSearch]=useState('')
  const [showFilters,setShowFilters]=useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [savedInvoice, setSavedInvoice] = useState('')
  const [lines, setLines] = useState<Record<string, number>>({})
  const [terms, setTerms] = useState('0')
  const [nextVisit, setNextVisit] = useState('')
  const [initialReceipt, setInitialReceipt] = useState('0.0')
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
  const draftKey=`order-draft:${ownerId}:${outletId}`,pendingMeta=`order-pending:${ownerId}:${outletId}`
  const [draftReady,setDraftReady]=useState(false)
  const draftWrites=useRef(Promise.resolve())
  useEffect(()=>{let active=true;void Promise.all([db.local_meta.get(draftKey),db.local_meta.get(pendingMeta)]).then(([draft,pending])=>{if(!active)return;if(pending){const saved=JSON.parse(pending.value);attempt.current=saved;setPendingAttempt(saved)}if(draft){const saved=JSON.parse(draft.value);setLines(saved.lines??{});setTerms(saved.terms??'0');setInitialReceipt(saved.collected??'0.0');setNextVisit(saved.nextVisit??'')}setDraftReady(true)}).catch(e=>setError(message(e)));return()=>{active=false}},[draftKey,pendingMeta])
  useEffect(()=>{if(!draftReady||pendingAttempt)return;draftWrites.current=draftWrites.current.catch(()=>{}).then(async()=>{await db.local_meta.put({key:draftKey,value:JSON.stringify({lines,terms,collected:initialReceipt,nextVisit})})});void draftWrites.current.catch(e=>setError('Draft save failed: '+message(e)))},[draftReady,pendingAttempt,draftKey,lines,terms,initialReceipt,nextVisit])
  const handled=useRef(new Set<string>())
  const confirmed=useCallback(async(id:string,result:{order_id:string;invoice_no:number})=>{
    if(handled.current.has(id))return;handled.current.add(id)
    try{
      await draftWrites.current
      await db.transaction('rw',db.local_meta,async()=>{await db.local_meta.delete(pendingMeta);await db.local_meta.delete(draftKey)})
      attempt.current=null;try{localStorage.removeItem(pendingKey);sessionStorage.removeItem(pendingKey)}catch{/* Confirmed server result remains durable; storage cleanup must not create a new attempt. */}
      setPendingAttempt(null);setLines({});setTerms('0');setInitialReceipt('0.0');setNextVisit('');setReviewing(false)
      setSuccess('Thank you! Order #'+result.invoice_no+' submitted.');setSavedInvoice(result.order_id)
      onSaved(result)
    }catch(e){handled.current.delete(id);setError('Order accepted, but local cleanup needs retry: '+message(e))}
  },[draftKey,pendingMeta,pendingKey,onSaved])
  useEffect(()=>{if(!pendingAttempt)return;const id=pendingAttempt.id;const sub=liveQuery(()=>db.local_meta.get('command-result:'+id)).subscribe({next:row=>{if(!row)return;const ack=JSON.parse(row.value);if(ack.owner_id!==ownerId||!ack.result?.order_id)return;void confirmed(id,ack.result)},error:e=>setError(message(e))});return()=>sub.unsubscribe()},[pendingAttempt,ownerId,confirmed])


  const brands = [...new Set(catalog.data?.map(brandOf))].sort()
  const query = search.trim().toLocaleLowerCase()
  const visibleProducts = catalog.data?.filter(item => (!brand || brandOf(item) === brand) && (!productLine || item.product_line === productLine) && (!mode || catalogMode(item.product_line)===mode) && (!query || [skuOf(item),brandOf(item),item.product_line,item.sku].join(' ').toLocaleLowerCase().includes(query)))
  const selected = catalog.data?.filter(i => lines[i.id] > 0) ?? []
  const total = sum(selected.map(i => packTotal(i.selling_price, i.items_per_half_pack, lines[i.id])))
  let paymentSummary: ReturnType<typeof checkoutBalance> | undefined
  try { paymentSummary = checkoutBalance(total,initialReceipt) } catch { /* Display validation on submit. */ }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase || busy || (selected.length === 0 && !attempt.current)) return
    setBusy(true)
    setError('')
    setSuccess('')
    const items = selected.map(i => ({ sku_id: i.id, quantity: lines[i.id], price: i.selling_price, uom: 'pack' as const, items_per_half_pack: i.items_per_half_pack, packs_per_box: i.packs_per_box }))
    const receipt = initialReceipt
    let initialAmount: bigint
    try { initialAmount = usdCents(receipt) }
    catch { setError('Enter a USD amount with at most two decimal places.'); setBusy(false); return }
    if (!attempt.current && (initialAmount < 0n || initialAmount > usdCents(total))) {
      setError('Enter an initial receipt from zero to the invoice total, with at most two decimal places.')
      setBusy(false)
      return
    }
    if (!attempt.current && !validTerms(Number(terms))) { setError('Choose Cash or credit terms from 4 to 10 days.'); setBusy(false); return }
    const key = JSON.stringify([items, terms, nextVisit, receipt, visitId])
    if (!attempt.current) attempt.current = { key, id: crypto.randomUUID() }
    setPendingAttempt(attempt.current)
    const [savedItems, savedTerms, savedNextVisit, savedReceipt, savedVisit] = JSON.parse(attempt.current.key) as [
      { sku_id: string; quantity: number; price: number; uom: 'pack'; items_per_half_pack: number; packs_per_box: number }[], string, string, string, string,
    ]
    const submittedId=attempt.current.id
    try {
      await draftWrites.current
      await db.local_meta.put({key:pendingMeta,value:JSON.stringify(attempt.current)})
      try{localStorage.setItem(pendingKey, JSON.stringify(attempt.current))}catch{/* Durable IndexedDB copy remains. */}
      if (!savedVisit || savedItems.some(item => item.uom !== 'pack' || !item.items_per_half_pack)) throw Error('Legacy order retained for review. Do not reinterpret its saved quantities.');
      const result = await soloApi(supabase).issueInvoice({
        id: attempt.current.id,
        request: {
          contract_version: 2, currency: 'USD', outlet_id: outletId, visit_id: savedVisit,
          items: savedItems.map(item => ({ ...item, price: String(item.price) })),
          terms_days: Number(savedTerms),
          next_visit: savedNextVisit || undefined,
          initial_amount: savedReceipt,
          method: 'cash',
        },
      })
      await confirmed(submittedId,result)
    } catch (failure) {
      setError(navigator.onLine?message(failure):'')
    } finally {
      setBusy(false)
    }
  }

  if (pendingAttempt) {
    let frozen: {items: {sku_id:string;quantity:number;price:number;uom?:string;items_per_half_pack?:number;packs_per_box?:number}[]; terms:string; collected:string}|undefined
    try { const [items,savedTerms,,collected]=JSON.parse(pendingAttempt.key);if(Array.isArray(items))frozen={items,terms:savedTerms,collected} } catch { /* Retain unreadable request for review. */ }
    return <form className="form" onSubmit={e=>void submit(e)}><section className="card"><h2>Order saved on this device</h2><p>Waiting for server confirmation. Upload resumes automatically when connected; an invoice is issued only after acceptance.</p>
      {frozen ? <><p>Terms: {Number(frozen.terms)===0 ? 'Cash — due today' : `Credit — ${frozen.terms} days`}</p><p>Collected: {money(frozen.collected)}</p><ul>{frozen.items.map((item,index)=><li key={index}>{catalog.data?.find(p=>p.id===item.sku_id)?.flavour || 'Saved item'} · {item.uom==='pack' && item.packs_per_box ? packBreakdown(item.quantity,item.packs_per_box) : 'Original quantity retained for review'}</li>)}</ul></> : <p>The saved request needs review; it has not been deleted.</p>}
      <button className="primary" disabled={busy || !frozen}>{busy?'Retrying…':'Retry upload'}</button>
      {error && <p className="error" role="alert">{error}</p>}
    </section></form>
  }

  return <form className="form" onSubmit={(e) => void submit(e)}>
    <fieldset disabled={busy || !draftReady} className="form retail-fields">
      {reviewing ? <>
        <button className="link" type="button" onClick={() => setReviewing(false)}>Back to products</button>
        <section className="card">
          <h2>Review order</h2>
          {selected.map(item => <div className="summary-line" key={item.id}>
            <span>{skuOf(item)} × {packBreakdown(lines[item.id],item.packs_per_box)}</span><strong>{money(packTotal(item.selling_price, item.items_per_half_pack, lines[item.id]))}</strong>
          </div>)}
          <div className="summary-line"><strong>Total</strong><strong>{money(total)}</strong></div>
        </section>
        <label>Payment terms<select value={terms} onChange={e => setTerms(e.target.value)}>
          <option value="0">Cash — due today</option>
          {CREDIT_DAYS.map(days => <option key={days} value={days}>Credit — {days} days</option>)}
        </select></label>
        <label>Amount collected now · $<input type="number" min="0" max={total}
          step="0.01" required value={initialReceipt} onChange={e => setInitialReceipt(e.target.value)} /></label>
        <div className="card summary-line"><span>Remaining balance · {paymentSummary?.status ?? 'Check amount'}</span>
          <strong>{paymentSummary ? money(paymentSummary.remaining) : '—'}</strong></div>
        <p className="muted">Cash means due today. Only the amount collected marks the invoice paid. {paymentSummary?.status === 'Paid' ? 'Paid invoices need no collection reminder.' : 'A collection reminder is set for four days.'}</p>
        <label>Next visit<input type="date" value={nextVisit} onChange={e => setNextVisit(e.target.value)} /></label>
        <button className="primary" disabled={selected.length === 0 && !pendingAttempt}>
          {busy ? 'Creating invoice…' : 'Submit and create invoice'}
        </button>
      </> : <>
        <h2 className="order-title">New Order</h2>
        <div className="catalog-search-row"><label className="mobile-search"><MobileIcon name="search" size={20}/><input aria-label="Search products" placeholder="Search products…" type="search" value={search} onChange={e=>setSearch(e.target.value)}/></label><button type="button" className="filter-toggle" aria-label="Product filters" aria-expanded={showFilters} onClick={()=>setShowFilters(value=>!value)}><MobileIcon name="filter" size={22}/></button></div>
        <nav className="retail-tabs brand-filters" aria-label="Catalog brand">
          <button type="button" aria-pressed={!brand} onClick={() => {setBrand('');setProductLine('')}}>All</button>
          {brands.map(value => <button type="button" key={value} aria-pressed={brand === value}
            onClick={() => {setBrand(value);setProductLine('')}}>{value}</button>)}
        </nav>
        <label hidden={!showFilters}>Product line<select value={productLine} onChange={e=>setProductLine(e.target.value)}><option value="">All product lines</option>{[...new Set(catalog.data?.filter(item=>!brand||brandOf(item)===brand).map(item=>item.product_line))].sort().map(line=><option key={line}>{line}</option>)}</select></label>
        <div className="catalog-toolbar"><label>Product type<select value={mode} onChange={e=>{setMode(e.target.value);setProductLine('')}}><option value="">All types</option><option value="DTL">DTL · Direct to lung</option><option value="MTL">MTL · Mouth to lung</option></select></label><div className="layout-switch" role="group" aria-label="Product layout"><button type="button" aria-pressed={layout==='list'} onClick={()=>{setLayout('list');try{localStorage.setItem('catalog-layout','list')}catch{}}}>List</button><button type="button" aria-pressed={layout==='grid'} onClick={()=>{setLayout('grid');try{localStorage.setItem('catalog-layout','grid')}catch{}}}>2 columns</button></div></div>
        <p className="muted catalog-help">Use −/+ in ½ Pack steps. DTL and MTL are product types within a brand.</p>
        <div className={'catalog-cards '+layout}>
        {visibleProducts?.map(item => <div className="card sku-row" key={item.id}>
          <div className="product-tags"><span>{brandOf(item)}</span><span>{catalogMode(item.product_line)||'Type not set'}</span><span title="Inventory quantities are not tracked yet">Stock not tracked</span></div><ProductImage path={item.image_path} label={skuOf(item)}/>
          <div className="sku-info"><strong>{skuOf(item)}</strong><p className="product-line-name">{item.product_line}</p><p>{money(packTotal(item.selling_price, item.items_per_half_pack, 1))} / Pack</p></div>
          <div className="stepper-area"><div className="stepper">
            <button type="button" aria-label={'Decrease ' + skuOf(item)} disabled={!lines[item.id]}
              onClick={() => setLines(current => ({ ...current, [item.id]: Math.max(0, (current[item.id] || 0) - 0.5) }))}>−</button>
            <output aria-label={skuOf(item) + ' quantity'}>{packBreakdown(lines[item.id] || 0,item.packs_per_box)}</output>
            <button type="button" className="primary" aria-label={'Increase ' + skuOf(item)} disabled={lines[item.id] >= 100000}
              onClick={() => setLines(current => ({ ...current, [item.id]: (current[item.id] || 0) + 0.5 }))}>+</button>
          </div>
          </div>
        </div>)}
        </div>
        {catalog.data && catalog.data.length > 0 && visibleProducts?.length === 0 && <p role="status">No products match your search and filters.</p>}
        {catalog.data && catalog.data.length > 0 && <div className="cart-total"><div><strong>Cart · {selected.length} {selected.length === 1 ? 'item' : 'items'}</strong><span>{money(total)}</span></div>
          <button type="button" className="primary" disabled={!selected.length} onClick={() => setReviewing(true)}>View Cart <MobileIcon name="cart" size={18}/></button></div>}
      </>}
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
  const competitors = useRows(async()=>{
    const brands=await fieldTable<{id:string;name:string;is_own:boolean;active:boolean}>(db,'survey_brands')
    const products=await fieldTable<{id:string;brand_id:string;product_line:string;flavour:string}>(db,'solo_competitor_catalog')
    if(brands&&products)return {brands:brands.filter(b=>!b.is_own&&b.active),products}
    return cachedFieldRead(db,'competitor-definitions',async()=>{
      if(!supabase)throw Error('Sync competitor definitions first.')
      const [b,p]=await Promise.all([supabase.from('survey_brands').select('id,name').eq('is_own',false).eq('active',true),supabase.from('solo_competitor_catalog').select('id,brand_id,product_line,flavour')]);if(b.error||p.error)throw b.error||p.error;return {brands:b.data,products:p.data}
    })
  },'competitor-definitions')

  const [kind, setKind] = useState('competitor_price')
  const [photo, setPhoto] = useState<File>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

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
      const owner=await offlineOwner(db)
      const attachment=promotion?photo:undefined
      const id=crypto.randomUUID()
      const request={...fields,price:fields.price===null?null:value('price'),photo_path:attachment?owner+'/'+id:null}
      await stagePhoto(db,owner,id,request,attachment)
      try{await soloApi(supabase).submitObservation({id,request});setSuccess('Survey uploaded.')}catch{setSuccess('Survey and photo saved on this device. Upload resumes automatically when connected.')}
      form.reset()
      setKind('competitor_price')
      setPhoto(undefined)
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
    <button className="icon-button" aria-label="Refresh report" title="Refresh report" onClick={() => { setClock(Date.now()); setRefresh(v => v + 1) }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M20 7a9 9 0 1 0 1 9M20 2v6h-6"/></svg></button>
    <dl className="metrics">
      <div><dt>↗ Sales</dt><dd title={money(report.sales)}>{formatUsdSummary(report.sales)}</dd></div>
      <div><dt>↙ Cash collected</dt><dd title={money(report.netCash)}>{formatUsdSummary(report.netCash)}</dd></div>
      <div><dt>◷ To collect</dt><dd>{money(report.outstanding)}</dd></div>
      <div><dt>Overpayments</dt><dd>{money(report.overpayment)}</dd></div>
      <div><dt>Overdue invoices</dt><dd>{money(report.overdue)}</dd></div>
      <div><dt>⌂ Retails</dt><dd>{data.retails}</dd></div>
      {['Paid', 'Partially paid', 'Unpaid'].map(status =>
        <div key={status}><dt>{status} invoices</dt><dd>{data.invoices.filter(i => i.payment_status === status).length}</dd></div>)}
    </dl>
    {report.discrepancy !== '0.00' && <p className="error" role="alert">Payment totals need reconciliation: {money(report.discrepancy)} difference. Refresh before using this report.</p>}
    {report.unallocatedCash !== '0.00' && <p className="warn-text">Cash not matched to listed invoices: {money(report.unallocatedCash)}. Included in net cash, kept separate from invoice balances.</p>}
    {report.unknownAging !== '0.00' && <p className="warn-text">Balance without a due date: {money(report.unknownAging)}. Not counted as overdue.</p>}
    {missingCosts > 0 && <p className="warn-text">{missingCosts} invoices have incomplete cost snapshots. Complete profit reporting is unavailable.</p>}
    <section className="card" aria-label="Due payment reminders" id="payment-follow-up">
      <h2 className="row"><span>◷ Payment follow-up</span><span className={report.due.length?'tag warn':'tag ok'} aria-label={report.due.length+' reminders due'}>{report.due.length || 'All clear'}</span></h2>
      <p className="muted">{data.invoices.filter(i=>usdCents(i.outstanding)>0n && i.due_date && i.due_date<baghdadDay(new Date(clock))).length} overdue invoices</p>
      {!report.due.length && <p>No payment reminders due.</p>}
      <ul>{report.due.map(({invoice,scheduled_at}) => <li key={invoice.id}>
        <strong>{invoice.recipient_snapshot?.name || 'Invoice #' + invoice.invoice_no}</strong> · #{invoice.invoice_no} · {money(invoice.outstanding)} remaining
        <p>Reminder: {new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Baghdad',dateStyle:'medium',timeStyle:'short'}).format(new Date(scheduled_at!))}</p>
        <Link className="button" to={'/admin?invoice=' + invoice.id}>Collect or set next reminder</Link>
      </li>)}</ul>
      <p className="muted">Reminders appear in the app. No push or email notifications.</p>
    </section>
    <section className="card"><h2>⇄ Exchange rate</h2>
      <p><strong>{rate?formatIqdRate(rate.exchange_rate_used):'Rate unavailable'}</strong></p>
      <p className="muted">{rate?(new Date(rate.valid_until).getTime()<=clock?'Expired — update before local payment':'Manually updated'):'USD payments available'}</p>
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
