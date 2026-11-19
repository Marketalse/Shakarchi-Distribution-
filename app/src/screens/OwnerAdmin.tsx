import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { operation, soloApi, type CollectionRequest, type Operation } from '../lib/solo-api'

type Row = Record<string, unknown> & { id?: string; order_id?: string }
const format = (value: unknown) => String(value ?? '—')
const text = (values: FormData, name: string) => String(values.get(name) ?? '').trim()
const date = (value: unknown) => value
  ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Baghdad', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(String(value)))
  : 'Unknown'
const tables = ['products', 'survey_brands', 'survey_versions', 'solo_invoice_balances', 'payments', 'collection_reminders', 'reminder_history', 'market_observations', 'outlets'] as const

async function readTable(table: string): Promise<Row[]> {
  if (!supabase) throw Error('Connect Supabase to load owner administration.')
  const result: Row[] = []
  const key = table === 'collection_reminders' ? 'order_id' : 'id'
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
  const [orderId, setOrderId] = useState(params.get('invoice') || '')
  const [preview, setPreview] = useState<{ kind: 'brands' | 'products' | 'observations'; rows: Record<string, unknown>[] }>()
  const [editProduct, setEditProduct] = useState<Row>()
  const [versionId, setVersionId] = useState('')
  // A failed financial request retains its exact payload and operation UUID.
  type Pending = { label: string; command: Operation<unknown> } | null
  const [pendingView, setPendingView] = useState<Pending>(() => {
    try { return JSON.parse(sessionStorage.getItem('wsd-owner-pending-operation') || 'null') }
    catch { return null }
  })
  const pending = useRef<Pending>(pendingView)
  const [surveyVisitId] = useState(() => crypto.randomUUID())


  useEffect(() => {
    let active = true
    void Promise.all(tables.map(async name => [name, await readTable(name)] as const)).then(
      entries => { if (active) setRows(Object.fromEntries(entries)) },
      failure => { if (active) setError(String(failure.message)) },
    )
    return () => { active = false }
  }, [revision])

  const records = (name: string) => rows[name] ?? []
  const invoice = records('solo_invoice_balances').find(row => row.id === orderId)
  const version = records('survey_versions').find(row => row.id === versionId)
  const ledger = records('payments').filter(row => row.order_id === orderId)
  const receipts = ledger.filter(row => Number(row.amount) > 0 && ['receipt', 'legacy'].includes(String(row.entry_type)))
  const reminder = records('collection_reminders').find(row => row.order_id === orderId)

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
      sessionStorage.setItem('wsd-owner-pending-operation', JSON.stringify(pending.current))
      await send(pending.current.command)
      pending.current = null
      setPendingView(null)
      sessionStorage.removeItem('wsd-owner-pending-operation')
      setNotice(label + ' saved')
      setRevision(value => value + 1)
    } catch (failure) {
      const code = (failure as Error & { code?: string }).code
      if (code && /^(P000[12]|22|23|42501)/.test(code)) {
        pending.current = null
        setPendingView(null)
        sessionStorage.removeItem('wsd-owner-pending-operation')
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
            order_id: orderId, outlet_id: String(invoice.outlet_id),
            kind: get('kind') as CollectionRequest['kind'], amount: get('amount'),
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
        case 'brand':
          await perform('Brand', { kind: 'brands', rows: [{ name: get('name'), is_own: get('is_own') === 'true' }] },
            command => api.importData(command as Parameters<typeof api.importData>[0]))
          break
        case 'product': {
          const product = {
            sku: get('sku'), product_line: get('product_line'), flavour: get('flavour'), brand_id: get('brand_id'),
            wholesale_price: get('wholesale_price'), cost_price: get('cost_price') || null,
            active: get('active') === 'true',
          }
          const brand = records('survey_brands').find(row => row.id === product.brand_id)
          if (!brand) throw Error('Select a brand.')
          if (editProduct) {
            if (pending.current) throw Error('Retry the pending operation first.')
            setBusy(true)
            const { error } = await supabase.from('products').update({ ...product, brand: brand.name }).eq('id', editProduct.id)
            if (error) throw Error(error.message)
            setEditProduct(undefined)
            setNotice('Product updated')
            setRevision(value => value + 1)
          } else {
            await perform('Product', { kind: 'products', rows: [product] },
              command => api.importData(command as Parameters<typeof api.importData>[0]))
          }
          break
        }
        case 'publish': {
          const questions = JSON.parse(get('questions'))
          await perform('Survey version', { title: get('title'), questions },
            command => api.publishSurvey(command as Parameters<typeof api.publishSurvey>[0]))
          break
        }
        case 'run': {
          if (!version) throw Error('Select a survey version.')
          const questions = version.questions as { id: string; type: string }[]
          const answers = Object.fromEntries(questions.flatMap(question => {
            const value = get(question.id)
            if (!value) return []
            return [[question.id, question.type === 'boolean' ? value === 'true' : question.type === 'number' ? Number(value) : value]]
          }))
          await perform('Survey answers', {
            version_id: versionId, outlet_id: get('outlet_id'), visit_id: get('visit_id'), answers,
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
      {['Collections', 'Products', 'Brands', 'Surveys', 'Imports', 'Observations'].map(label =>
        <button key={label} onClick={() => setTab(label)} aria-pressed={tab === label}>{label}</button>)}
    </nav>
    {error && <p className="error" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {pendingView && <p>Pending operation {pendingView.command.id}. <button disabled={busy} onClick={retryPending}>Retry saved operation</button></p>}
    {!rows.products && !error && <p role="status">Loading owner records…</p>}
    {tab === 'Collections' && <>
      <label>Invoice<select value={orderId} onChange={event => setOrderId(event.target.value)}>
        <option value="">Choose invoice</option>
        {records('solo_invoice_balances').map(row => <option key={row.id} value={row.id}>
          #{format(row.invoice_no)} · {format(row.payment_status)} · {format(row.outstanding)} IQD
        </option>)}
      </select></label>
      {invoice && <>
        <dl className="metrics">
          {['total', 'collected', 'outstanding', 'overpayment'].map(key => <div key={key}><dt>{key}</dt><dd>{format(invoice[key])} IQD</dd></div>)}
        </dl>
        <form {...formProps} data-kind="collection">
          <label>Operation<select name="kind"><option value="receipt">Receipt</option><option value="refund">Refund</option><option value="correction">Correct receipt</option></select></label>
          <label>Amount · IQD<input name="amount" type="number" min="0" step="0.01" required /></label>
          <label>Method<select name="method"><option value="cash">Cash</option><option value="transfer">Transfer</option></select></label>
          <label>Original receipt for refund or correction<select name="receipt_id"><option value="">Choose receipt</option>
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
        <ul>{ledger.map(row => <li key={row.id}>{format(row.entry_type)} · {format(row.amount)} IQD · {date(row.collected_at)} · {format(row.note)}</li>)}</ul>
        <h2>Reminder history</h2>
        <ul>{records('reminder_history').filter(row => row.order_id === orderId).map(row =>
          <li key={row.id}>{format(row.reason)} · {date(row.created_at)} → {date(row.scheduled_at)}</li>)}</ul>
      </>}
    </>}
    {tab === 'Products' && <>
      <ul>{records('products').map(row => <li key={row.id}>
        <button onClick={() => setEditProduct(row)}>{format(row.sku)} · {format(row.product_line)} · {format(row.wholesale_price)} IQD · {row.active ? 'Active' : 'Inactive'}</button>
      </li>)}</ul>
      <h2>{editProduct ? 'Edit product' : 'Add product'}</h2>
      {editProduct && <button onClick={() => setEditProduct(undefined)}>New product</button>}
      <form {...formProps} data-kind="product" key={editProduct?.id || 'new'}>
        <label>SKU<input name="sku" defaultValue={format(editProduct?.sku === undefined ? '' : editProduct.sku)} required /></label>
        <label>Product name<input name="product_line" defaultValue={String(editProduct?.product_line || '')} required /></label>
        <label>Variant<input name="flavour" defaultValue={String(editProduct?.flavour || '')} required /></label>
        <label>Brand<select name="brand_id" defaultValue={String(editProduct?.brand_id || '')} required>
          <option value="">Choose brand</option>{records('survey_brands').map(row => <option key={row.id} value={row.id}>{format(row.name)}</option>)}
        </select></label>
        <label>Wholesale · IQD<input name="wholesale_price" type="number" min="0" step="0.01" required defaultValue={String(editProduct?.wholesale_price ?? '')} /></label>
        <label>Cost · IQD<input name="cost_price" type="number" min="0" step="0.01" defaultValue={String(editProduct?.cost_price ?? '')} /></label>
        <label>Activation<select name="active" defaultValue={String(editProduct?.active ?? true)}><option value="true">Active</option><option value="false">Inactive</option></select></label>
        {submitButton}
      </form>
    </>}
    {tab === 'Brands' && <>
      <ul>{records('survey_brands').map(row => <li key={row.id}>{format(row.name)} · {row.active ? 'Active' : 'Inactive'}
        <button disabled={busy} onClick={() => void toggleBrand(row)}>Toggle activation</button></li>)}</ul>
      <form {...formProps} data-kind="brand">
        <label>Brand name<input name="name" required /></label>
        <label>Ownership<select name="is_own"><option value="true">Own brand</option><option value="false">Competitor</option></select></label>
        {submitButton}
      </form>
    </>}
    {tab === 'Surveys' && <>
      <h2>Publish a fixed survey version</h2>
      <form {...formProps} data-kind="publish">
        <label>Title<input name="title" required /></label>
        <label>Questions · JSON<textarea name="questions" rows={8} required defaultValue={JSON.stringify([{ id: 'available', label: 'Available?', type: 'boolean', required: true }], null, 2)} /></label>
        {submitButton}
      </form>
      <h2>Capture answers</h2>
      <label>Version<select value={versionId} onChange={event => setVersionId(event.target.value)}>
        <option value="">Choose version</option>{records('survey_versions').map(row => <option key={row.id} value={row.id}>{format(row.title)} · {row.id}</option>)}
      </select></label>
      {version && <form {...formProps} data-kind="run" key={versionId}>
        <label>Client<select name="outlet_id" required><option value="">Choose client</option>{records('outlets').map(row =>
          <option key={row.id} value={row.id}>{format(row.retail_name)}</option>)}</select></label>
        <label>Visit UUID · reuse for this shop stop<input name="visit_id" defaultValue={surveyVisitId} required /></label>
        {(version.questions as { id: string; label: string; type: string; required: boolean; options?: string[] }[]).map(question =>
          <label key={question.id}>{question.label}{question.type === 'choice' || question.type === 'boolean'
            ? <select name={question.id} required={question.required}><option value="">Choose</option>
              {(question.type === 'boolean' ? ['true', 'false'] : question.options || []).map(value => <option key={value}>{value}</option>)}</select>
            : <input name={question.id} type={question.type === 'number' ? 'number' : 'text'} step="any" required={question.required} />}</label>)}
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
          if (client) void perform('Import', preview, command => soloApi(client).importData(command as Parameters<ReturnType<typeof soloApi>['importData']>[0]))
        }}>Commit batch</button>
      </section>}
    </>}
    {tab === 'Observations' && <>
      <p>Imports accept competitor_price, new_brand and promotion observations. Supply outlet_id and visit_id, then price or offer, availability, facings and shelf_width_cm.</p>
      <ul>{records('market_observations').map(row => <li key={row.id}>
        {format(row.brand)} · {format(row.model)} · {format(row.price)} IQD · {format(row.offer)} · {date(row.created_at)}
        <br />Availability {format(row.available)} · Facings {format(row.facings)} · Shelf cm {format(row.shelf_width_cm)}
      </li>)}</ul>
      <button onClick={() => setTab('Imports')}>Import observations</button>
    </>}
  </main>
}
