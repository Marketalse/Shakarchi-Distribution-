import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { openSharedVisit } from '../lib/shared-visit'
import { supabase } from '../lib/supabase'
import { formatUsd, localToUsd } from '../lib/money'
import { operation, soloApi, type CollectionRequest, type Operation } from '../lib/solo-api'

type Row = Record<string, unknown> & { id?: string; order_id?: string }
const format = (value: unknown) => String(value ?? '—')
const text = (values: FormData, name: string) => String(values.get(name) ?? '').trim()
const date = (value: unknown) => value
  ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Baghdad', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(String(value)))
  : 'Unknown'
const tables = ['products', 'survey_brands', 'survey_versions', 'solo_invoice_balances', 'payments', 'collection_reminders', 'reminder_history', 'market_observations', 'survey_runs', 'outlets', 'fx_rate_versions', 'payment_fx_snapshots'] as const

async function readTable(table: string): Promise<Row[]> {
  if (!supabase) throw Error('Connect Supabase to load owner administration.')
  const result: Row[] = []
  const key = table === 'collection_reminders' ? 'order_id' : table === 'payment_fx_snapshots' ? 'operation_id' : 'id'
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from(table).select('*').order(key).range(offset, offset + 499)
    if (error) throw Error(error.message)
    result.push(...(data as Row[]))
    if (data.length < 500) return result
  }
}

export function OwnerAdmin() {
  const [params] = useSearchParams()
  const [tab, setTab] = useState('Collections')
  const [rows, setRows] = useState<Record<string, Row[]>>({})
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [settlementCurrency, setSettlementCurrency] = useState('USD')
  const [collectionKind, setCollectionKind] = useState('receipt')
  const [receiptId, setReceiptId] = useState('')
  const [localAmount, setLocalAmount] = useState('')
  const [clock, setClock] = useState(Date.now)
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 30000); return () => clearInterval(timer) }, [])
  const [orderId, setOrderId] = useState(params.get('invoice') || '')
  const [preview, setPreview] = useState<{ kind: 'brands' | 'products' | 'observations'; rows: Record<string, unknown>[] }>()
  const [editProduct, setEditProduct] = useState<Row>()
  const [productBrandId, setProductBrandId] = useState('')
  const [versionId, setVersionId] = useState('')
  const [questions, setQuestions] = useState([{ id: crypto.randomUUID(), label: '', type: 'text', required: true, options: '' }])
  const changeQuestion = (id: string, changes: Partial<(typeof questions)[number]>) => setQuestions(rows => rows.map(q => q.id === id ? { ...q, ...changes } : q))
  // A failed financial request retains its exact payload and operation UUID.
  type Pending = { label: string; command: Operation<unknown> } | null
  const [pendingView, setPendingView] = useState<Pending>(() => {
    try { return JSON.parse(localStorage.getItem('wsd-owner-pending-operation') || sessionStorage.getItem('wsd-owner-pending-operation') || 'null') }
    catch { return null }
  })
  const pending = useRef<Pending>(pendingView)



  useEffect(() => {
    let active = true
    void Promise.all(tables.map(async name => [name, await readTable(name)] as const)).then(
      entries => { if (active) setRows(Object.fromEntries(entries)) },
      failure => { if (active) setError(String(failure.message)) },
    )
    return () => { active = false }
  }, [revision])

  const records = (name: string) => rows[name] ?? []
  const productBrand = records('survey_brands').find(row => row.id === productBrandId)
  const invoice = records('solo_invoice_balances').find(row => row.id === orderId)
  const version = records('survey_versions').find(row => row.id === versionId)
  const ledger = records('payments').filter(row => row.order_id === orderId)
  const receipts = ledger.filter(row => Number(row.amount) > 0 && ['receipt', 'legacy'].includes(String(row.entry_type)))
  const reminder = records('collection_reminders').find(row => row.order_id === orderId)
  const latestRate = [...records('fx_rate_versions')].sort((a, b) => Number(b.version) - Number(a.version))[0]
  const originalFx = records('payment_fx_snapshots').find(row => row.payment_id === receiptId)
  const settlementRate = collectionKind === 'correction' ? originalFx : latestRate
  const rateExpired = !latestRate || new Date(String(latestRate.valid_until)).getTime() <= clock
  let convertedAmount = '—'
  try {
    if (settlementRate && localAmount) convertedAmount = formatUsd(localToUsd(localAmount, String(settlementRate.exchange_rate_used)))
  } catch { convertedAmount = 'Enter a valid amount' }


  async function perform(label: string, request: unknown, send: (command: Operation<unknown>) => Promise<unknown>) {
    if (busy) return
    if (pending.current && (pending.current.label !== label || JSON.stringify(pending.current.command.request) !== JSON.stringify(request))) {
      setError('Retry the pending operation before submitting different details. Its UUID and payload have been retained.')
      return
    }
    pending.current ??= { label, command: operation(request) }
    setPendingView(pending.current)
    setBusy(true)
    setError('')
    try {
      localStorage.setItem('wsd-owner-pending-operation', JSON.stringify(pending.current))
      await send(pending.current.command)
      pending.current = null
      setPendingView(null)
      localStorage.removeItem('wsd-owner-pending-operation'); sessionStorage.removeItem('wsd-owner-pending-operation')
      setNotice(label + ' saved')
      setRevision(value => value + 1)
    } catch (failure) {
      const code = (failure as Error & { code?: string }).code
      if (code && /^(P000[12]|22|23|42501)/.test(code)) {
        pending.current = null
        setPendingView(null)
        localStorage.removeItem('wsd-owner-pending-operation'); sessionStorage.removeItem('wsd-owner-pending-operation')
      }
      setError((failure as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || busy) return
    const form = event.currentTarget
    const values = new FormData(form)
    const get = (name: string) => text(values, name)
    const api = soloApi(supabase)
    try {
      switch (form.dataset.kind) {
        case 'collection': {
          if (!invoice) throw Error('Select an invoice.')
          const request: CollectionRequest = {
            currency: 'USD', order_id: orderId, outlet_id: String(invoice.outlet_id),
            kind: get('kind') as CollectionRequest['kind'],
            amount: settlementCurrency === 'USD' ? get('amount') : undefined,
            settlement_currency: settlementCurrency as 'USD' | 'IQD',
            source_amount: settlementCurrency === 'IQD' ? get('source_amount') : undefined,
            rate_version_id: settlementCurrency === 'IQD' ? String(settlementRate?.rate_version_id || settlementRate?.id || '') : undefined,
            method: get('method') as 'cash' | 'transfer',
            receipt_id: get('receipt_id') || undefined, reason: get('reason') || undefined,
          }
          await perform('Collection', request, command => api.postCollection(command as Operation<CollectionRequest>))
          break
        }
        case 'reminder': {
          const scheduled = new Date(get('scheduled_at') + ':00+03:00')
          if (!invoice || !Number.isFinite(scheduled.getTime())) throw Error('Select an invoice and future Baghdad time.')
          await perform('Reminder', { order_id: orderId, scheduled_at: scheduled.toISOString() },
            command => api.rescheduleReminder(command as Parameters<typeof api.rescheduleReminder>[0]))
          break
        }
        case 'fx-rate': {
          const expires = new Date(get('valid_until') + ':00+03:00')
          if (!Number.isFinite(expires.getTime())) throw Error('Choose a future Baghdad expiry time.')
          await perform('Parallel market rate', {
            exchange_rate_used: get('exchange_rate_used'), rate_source: get('rate_source'), valid_until: expires.toISOString(),
          }, command => api.publishRate(command as Parameters<typeof api.publishRate>[0]))
          break
        }
        case 'brand':
          await perform('Brand', { currency: 'USD', kind: 'brands', rows: [{ name: get('name'), is_own: get('is_own') === 'true' }] },
            command => api.importData(command as Parameters<typeof api.importData>[0]))
          break
        case 'product': {
          const product = {
            sku: get('sku'), product_line: get('product_line'), flavour: get('flavour'), brand_id: get('brand_id'),
            is_own_brand: Boolean(productBrand?.is_own),
            wholesale_price: productBrand?.is_own ? get('wholesale_price') || null : null,
            retail_price: get('retail_price') || null, puffs: get('puffs') || null, units_per_carton: get('units_per_carton') || null,
            cost_price: productBrand?.is_own ? get('cost_price') || null : null,
            active: get('active') === 'true',
          }
          const brand = records('survey_brands').find(row => row.id === product.brand_id)
          if (!brand) throw Error('Select a brand.')
          if (editProduct) {
            await perform('Product update', { ...product, id: editProduct.id, currency: 'USD' },
              command => api.updateProduct(command as Parameters<typeof api.updateProduct>[0]))
          } else {
            await perform('Product', { currency: 'USD', kind: 'products', rows: [product] },
              command => api.importData(command as Parameters<typeof api.importData>[0]))
          }
          break
        }
        case 'publish': {
          const definition = questions.map(q => ({ id: q.id, label: q.label.trim(), type: q.type, required: q.required, ...(q.type === 'choice' ? { options: q.options.split('\n').map(v => v.trim()).filter(Boolean) } : {}) }))
          await perform('Survey version', { title: get('title'), questions: definition },
            command => api.publishSurvey(command as Parameters<typeof api.publishSurvey>[0]))
          break
        }
        case 'run': {
          if (!version) throw Error('Select a survey version.')
          const questions = version.questions as { id: string; type: string }[]
          const answers = Object.fromEntries(questions.flatMap(question => {
            const value = get('answer:' + question.id)
            if (!value) return []
            return [[question.id, question.type === 'boolean' ? value === 'true' : question.type === 'number' ? Number(value) : value]]
          }))
          await perform('Survey answers', {
            version_id: versionId, outlet_id: get('outlet_id'), visit_id: await openSharedVisit(supabase, get('outlet_id'), 'survey'), brand_id: get('brand_id'), answers,
          }, command => api.submitSurvey(command as Parameters<typeof api.submitSurvey>[0]))
          break
        }
        case 'import': {
          const parsed = JSON.parse(get('rows'))
          if (!Array.isArray(parsed) || !parsed.length || parsed.length > 500 || parsed.some(row => !row || Array.isArray(row) || typeof row !== 'object')) {
            throw Error('Provide 1 to 500 JSON row objects.')
          }
          setPreview({ kind: get('kind') as 'brands' | 'products' | 'observations', rows: parsed })
          break
        }
      }
    } catch (failure) {
      setError((failure as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function toggleBrand(brand: Row) {
    if (!supabase || busy) return
    setBusy(true)
    try {
      const { error } = await supabase.from('survey_brands').update({ active: !brand.active }).eq('id', brand.id)
      if (error) throw Error(error.message)
      setRevision(value => value + 1)
    } catch (failure) { setError((failure as Error).message) }
    finally { setBusy(false) }
  }
  function retryPending() {
    const item = pending.current
    const client = supabase
    if (!item || !client) return
    const api = soloApi(client)
    const label = item.label
    void perform(label, item.command.request, command => {
      if (label === 'Parallel market rate') return api.publishRate(command as Parameters<typeof api.publishRate>[0])
      if (label === 'Product update') return api.updateProduct(command as Parameters<typeof api.updateProduct>[0])
      if (label === 'Collection') return api.postCollection(command as Parameters<typeof api.postCollection>[0])
      if (label === 'Reminder') return api.rescheduleReminder(command as Parameters<typeof api.rescheduleReminder>[0])
      if (label === 'Survey version') return api.publishSurvey(command as Parameters<typeof api.publishSurvey>[0])
      if (label === 'Survey answers') return api.submitSurvey(command as Parameters<typeof api.submitSurvey>[0])
      return api.importData(command as Parameters<typeof api.importData>[0])
    })
  }
  const formProps = { onSubmit: (event: FormEvent<HTMLFormElement>) => void submit(event), className: 'form' }
  const submitButton = <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>

  return <main>
    <h1>Owner administration</h1>
    <nav className="retail-tabs" aria-label="Owner administration">
      {['Collections', 'Exchange rate', 'Products', 'Brands', 'Surveys', 'Imports', 'Observations'].map(label =>
        <button key={label} onClick={() => setTab(label)} aria-pressed={tab === label}>{label}</button>)}
    </nav>
    {error && <><p className="error" role="alert">{error}</p>
      <button onClick={() => { setError(''); setRevision(value => value + 1) }}>Reload owner records</button></>}
    {notice && <p role="status">{notice}</p>}
    {pendingView && <p>Pending operation {pendingView.command.id}. <button disabled={busy} onClick={retryPending}>Retry saved operation</button></p>}
    {!rows.products && !error && <p role="status">Loading owner records…</p>}
    {tab === 'Exchange rate' && <>
      <h2>Manual parallel-market rate</h2>
      <p>Enter IQD per $1 using the rate you agree to accept. Official rates are never substituted.</p>
      {latestRate && <section className="card">
        <strong>{format(latestRate.exchange_rate_used)} IQD per $1</strong>
        <p>{rateExpired ? 'Expired — publish a new rate for local cash' : 'Active'} · {format(latestRate.rate_source)}</p>
        <p>Recorded {date(latestRate.rate_timestamp)} · Expires {date(latestRate.valid_until)}</p>
      </section>}
      <form {...formProps} data-kind="fx-rate">
        <label>IQD per $1<input name="exchange_rate_used" type="number" min="0.00000001" step="0.00000001" required /></label>
        <label>Source / agreed dealer quote<input name="rate_source" required placeholder="Parallel-market source or dealer" /></label>
        <label>Valid until · Baghdad time<input name="valid_until" type="datetime-local" required /></label>
        {submitButton}
      </form>
      <h2>Rate history</h2>
      <ul>{records('fx_rate_versions').map(row => <li key={row.id}>
        {format(row.exchange_rate_used)} IQD per $1 · {date(row.rate_timestamp)} · {format(row.rate_source)}
      </li>)}</ul>
    </>}
    {tab === 'Collections' && <>
      <label>Invoice<select value={orderId} onChange={event => setOrderId(event.target.value)}>
        <option value="">Choose invoice</option>
        {records('solo_invoice_balances').map(row => <option key={row.id} value={row.id}>
          #{format(row.invoice_no)} · {format(row.payment_status)} · {format(row.outstanding)} USD
        </option>)}
      </select></label>
      {invoice && <>
        <dl className="metrics">
          {['total', 'collected', 'outstanding', 'overpayment'].map(key => <div key={key}><dt>{key}</dt><dd>{format(invoice[key])} USD</dd></div>)}
        </dl>
        <form {...formProps} data-kind="collection">
          <label>Operation<select name="kind" value={collectionKind} onChange={event => setCollectionKind(event.target.value)}><option value="receipt">Receipt</option><option value="refund">Refund</option><option value="correction">Correct receipt</option></select></label>
          <label>Cash currency<select value={settlementCurrency} onChange={event => setSettlementCurrency(event.target.value)}>
            <option value="USD">USD</option><option value="IQD">IQD · parallel rate</option>
          </select></label>
          {settlementCurrency === 'USD' ? <label>Amount · USD<input name="amount" type="number" min="0" step="0.01" required /></label> : <>
            <label>Local cash · IQD<input name="source_amount" type="number" min="0" step="0.01" required value={localAmount} onChange={event => setLocalAmount(event.target.value)} /></label>
            <p>USD ledger amount {convertedAmount}</p>
            <p>{settlementRate ? format(settlementRate.exchange_rate_used) + ' IQD per $1 · ' + format(settlementRate.rate_source) : 'Choose a local receipt to correct or publish a rate first.'}</p>
            {collectionKind !== 'correction' && rateExpired && <p className="error">Publish a fresh rate before recording local cash.</p>}
          </>}
          <label>Method<select name="method"><option value="cash">Cash</option><option value="transfer">Transfer</option></select></label>
          <label>Original receipt for refund or correction<select name="receipt_id" value={receiptId} onChange={event => setReceiptId(event.target.value)}><option value="">Choose receipt</option>
            {receipts.map(row => <option key={row.id} value={row.id}>{format(row.amount)} · {date(row.collected_at)} · {row.id}</option>)}
          </select></label>
          <label>Reason for refund or correction<input name="reason" /></label>
          {submitButton}
        </form>
        <h2>Collection reminder</h2>
        <p>{format(reminder?.status)} · {date(reminder?.scheduled_at)}</p>
        <form {...formProps} data-kind="reminder">
          <label>Next reminder · Baghdad time<input name="scheduled_at" type="datetime-local" required /></label>
          <button disabled={busy || Number(invoice.outstanding) <= 0}>Reschedule</button>
        </form>
        <h2>Cash history</h2>
        <ul>{ledger.map(row => <li key={row.id}>{format(row.entry_type)} · {format(row.amount)} USD · {date(row.collected_at)} · {format(row.note)}</li>)}</ul>
        <h2>Local cash snapshots</h2>
        <ul>{records('payment_fx_snapshots').filter(row => ledger.some(entry => entry.operation_id === row.operation_id)).map(row =>
          <li key={String(row.operation_id)}>{format(row.source_amount)} IQD → {formatUsd(String(row.usd_amount))}<br />
            {format(row.exchange_rate_used)} IQD per $1 · {format(row.rate_source)}<br />{date(row.rate_timestamp)}</li>)}</ul>
        <h2>Reminder history</h2>
        <ul>{records('reminder_history').filter(row => row.order_id === orderId).map(row =>
          <li key={row.id}>{format(row.reason)} · {date(row.created_at)} → {date(row.scheduled_at)}</li>)}</ul>
      </>}
    </>}
    {tab === 'Products' && <>
      <ul>{records('products').map(row => <li key={row.id}>
        <button onClick={() => { setEditProduct(row); setProductBrandId(String(row.brand_id || '')) }}>{format(row.sku)} · {format(row.product_line)} · {format(row.wholesale_price)} USD · {row.is_own_brand ? 'Our catalog' : 'Competitor'} · {row.active ? 'Active' : 'Inactive'}</button>
      </li>)}</ul>
      <h2>{editProduct ? 'Edit product' : 'Add product'}</h2>
      {editProduct && <button onClick={() => { setEditProduct(undefined); setProductBrandId('') }}>New product</button>}
      <form {...formProps} data-kind="product" key={editProduct?.id || 'new'}>
        <label>SKU<input name="sku" defaultValue={format(editProduct?.sku === undefined ? '' : editProduct.sku)} required /></label>
        <label>Product line<input name="product_line" defaultValue={String(editProduct?.product_line || '')} required /></label>
        <label>Variant<input name="flavour" defaultValue={String(editProduct?.flavour || '')} required /></label>
        <label>Brand<select name="brand_id" value={productBrandId} onChange={e => setProductBrandId(e.target.value)} required>
          <option value="">Choose brand</option>{records('survey_brands').map(row => <option key={row.id} value={row.id}>{format(row.name)} · {row.is_own ? 'Our catalog' : 'Competitor'}</option>)}
        </select></label>
        <label>Wholesale · USD<input name="wholesale_price" type="number" min="0" step="0.01"  disabled={!productBrand?.is_own} defaultValue={String(editProduct?.wholesale_price ?? '')} /></label>
        <p>Own products may have no wholesale price while inactive. Add a price before activation.</p>
        <label>Retail · USD<input name="retail_price" type="number" min="0" step="0.01" defaultValue={String(editProduct?.retail_price ?? '')} /></label>
        <label>Puffs<input name="puffs" type="number" min="1" step="1" defaultValue={String(editProduct?.puffs ?? '')} /></label>
        <label>Units per carton<input name="units_per_carton" type="number" min="1" step="1" defaultValue={String(editProduct?.units_per_carton ?? '')} /></label>
        <label>Cost · USD<input name="cost_price" type="number" min="0" step="0.01" disabled={!productBrand?.is_own} defaultValue={String(editProduct?.cost_price ?? '')} /></label>
        <label>Activation<select name="active" defaultValue={String(editProduct?.active ?? true)}><option value="true">Active</option><option value="false">Inactive</option></select></label>
        {submitButton}
      </form>
    </>}
    {tab === 'Brands' && <>
      <ul>{records('survey_brands').map(row => <li key={row.id}>{format(row.name)} · {row.is_own ? 'Our catalog' : 'Competitor'} · {row.active ? 'Active' : 'Inactive'}
        <button disabled={busy} onClick={() => void toggleBrand(row)}>Toggle activation</button></li>)}</ul>
      <form {...formProps} data-kind="brand">
        <label>Brand name<input name="name" required /></label>
        <label>Classification<select name="is_own"><option value="true">Our catalog</option><option value="false">Competitor</option></select></label>
        {submitButton}
      </form>
    </>}
    {tab === 'Surveys' && <>
      <h2>Publish a fixed survey version</h2>
      <form {...formProps} data-kind="publish">
        <label>Title<input name="title" required /></label>
        {questions.map((q,index) => <fieldset key={q.id}>
          <legend>Question {index + 1}</legend>
          <label>Question label<input required value={q.label} onChange={e => changeQuestion(q.id,{ label: e.target.value })} /></label>
          <label>Answer type<select value={q.type} onChange={e => changeQuestion(q.id,{ type:e.target.value })}>{['text','number','boolean','choice'].map(type => <option key={type}>{type}</option>)}</select></label>
          <label><input type="checkbox" checked={q.required} onChange={e => changeQuestion(q.id,{required:e.target.checked})} />Required</label>
          {q.type === 'choice' && <label>Choices · one per line<textarea required value={q.options} onChange={e => changeQuestion(q.id,{options:e.target.value})} /></label>}
          {questions.length > 1 && <button type="button" onClick={() => setQuestions(rows => rows.filter(row => row.id !== q.id))}>Remove question</button>}
        </fieldset>)}
        <button type="button" disabled={questions.length >= 50} onClick={() => setQuestions(rows => [...rows,{id:crypto.randomUUID(),label:'',type:'text',required:true,options:''}])}>Add question</button>
        <p>Publishing creates a permanent version. Publish another version to change a form without changing past answers.</p>
        {submitButton}
      </form>
      <h2>Capture answers</h2>
      <label>Version<select value={versionId} onChange={event => setVersionId(event.target.value)}>
        <option value="">Choose version</option>{records('survey_versions').map(row => <option key={row.id} value={row.id}>{format(row.title)} · {row.id}</option>)}
      </select></label>
      {version && <form {...formProps} data-kind="run" key={versionId}>
        <label>Client<select name="outlet_id" required><option value="">Choose client</option>{records('outlets').map(row =>
          <option key={row.id} value={row.id}>{format(row.retail_name)}</option>)}</select></label>
        <label>Competitor brand<select name="brand_id" required><option value="">Choose competitor</option>
          {records('survey_brands').filter(row => !row.is_own && row.active).map(row =>
            <option key={row.id} value={row.id}>{format(row.name)}</option>)}
        </select></label>
        <p>Submitting starts or reuses the active visit for this client.</p>
        {(version.questions as { id: string; label: string; type: string; required: boolean; options?: string[] }[]).map(question =>
          <label key={question.id}>{question.label}{question.type === 'choice' || question.type === 'boolean'
            ? <select name={'answer:' + question.id} required={question.required}><option value="">Choose</option>
              {(question.type === 'boolean' ? ['true', 'false'] : question.options || []).map(value => <option key={value}>{value}</option>)}</select>
            : <input name={'answer:' + question.id} type={question.type === 'number' ? 'number' : 'text'} step="any" required={question.required} />}</label>)}
        {submitButton}
      </form>}
    </>}
    {tab === 'Imports' && <>
      <form {...formProps} data-kind="import">
        <label>Type<select name="kind">{['brands', 'products', 'observations'].map(kind => <option key={kind}>{kind}</option>)}</select></label>
        <label>Rows · JSON<textarea name="rows" rows={10} required /></label>
        <button disabled={busy}>Preview rows</button>
      </form>
      {preview && <section><h2>{preview.rows.length} {preview.kind} rows</h2>
        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(preview.rows, null, 2)}</pre>
        <button disabled={busy} onClick={() => {
          const client = supabase
          if (client) void perform('Import', { ...preview, currency: 'USD' }, command => soloApi(client).importData(command as Parameters<ReturnType<typeof soloApi>['importData']>[0]))
        }}>Commit batch</button>
      </section>}
    </>}
    {tab === 'Observations' && <>
      <h2>Completed survey forms</h2>
      <ul>{records('survey_runs').map(row => {
        const form = records('survey_versions').find(v => v.id === row.version_id)
        const client = records('outlets').find(v => v.id === row.outlet_id)
        const brand = records('survey_brands').find(v => v.id === row.brand_id)
        return <li key={row.id}><strong>{format(form?.title)}</strong> · {format(client?.retail_name)} · {format(brand?.name)} · {date(row.created_at)}
          <dl>{((form?.questions ?? []) as {id:string;label:string}[]).map(q => <div key={q.id}><dt>{q.label}</dt><dd>{format((row.answers as Record<string,unknown>)?.[q.id])}</dd></div>)}</dl>
        </li>
      })}</ul>
      <p>Imports accept competitor_price, new_brand and promotion observations. Supply outlet_id, visit_id, approved competitor brand_id and product_id, then price or offer, availability, facings and shelf_width_cm.</p>
      <ul>{records('market_observations').map(row => <li key={row.id}>
        {format(row.brand)} · {format(row.model)} · {format(row.price)} USD · {format(row.offer)} · {date(row.created_at)}
        <br />Availability {format(row.available)} · Facings {format(row.facings)} · Shelf cm {format(row.shelf_width_cm)}
      </li>)}</ul>
      <button onClick={() => setTab('Imports')}>Import observations</button>
    </>}
  </main>
}
