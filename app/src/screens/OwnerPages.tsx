import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { formatUsd } from '../lib/money'
import { supabase } from '../lib/supabase'

type Invoice = {
  id: string; invoice_no: number; outlet_id: string; total: string
  collected: string; outstanding: string; payment_status: string
  created_at: string; recipient_snapshot: { name?: string } | null
}
type InvoiceLine = {
  id: string; quantity: number; unit_price: string; line_total: string
  product_snapshot: { sku?: string; product_line?: string; flavour?: string } | null
}
const money = formatUsd
const day = (value: string) => new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Baghdad', dateStyle: 'medium',
}).format(new Date(value))
const fail = (value: unknown) => value instanceof Error ? value.message : String(value)

export function Orders({embedded=false}:{embedded?:boolean}={}) {
  const [params,setParams]=useSearchParams()
  const invoiceId=params.get('invoice')
  const [invoices, setInvoices] = useState<Invoice[]>()
  const [lines, setLines] = useState<InvoiceLine[]>()
  const [filter, setFilter] = useState('Pending invoices')
  const [selected, setSelected] = useState<Invoice>()
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      if (!supabase) throw Error('The database connection is unavailable.')
      const result: Invoice[] = []
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await supabase.from('solo_invoice_balances')
          .select('id,invoice_no,outlet_id,total,collected,outstanding,payment_status,created_at,recipient_snapshot')
          .order('created_at', { ascending: false }).order('id').range(offset, offset + 499)
        if (error) throw error
        result.push(...data as Invoice[])
        if (data.length < 500) break
      }
      if (active) {setInvoices(result);if(invoiceId){const target=result.find(row=>row.id===invoiceId);if(target)setSelected(target);else setError('Invoice unavailable.')}}
    }
    void load().catch(error => { if (active) setError(fail(error)) })
    return () => { active = false }
  }, [invoiceId])

  useEffect(() => {
    if (!selected) return
    let active = true
    void supabase?.from('order_lines').select('id,quantity,unit_price,line_total,product_snapshot')
      .eq('order_id', selected.id).order('id').then(({ data, error }) => {
        if (!active) return
        if (error) setError(error.message)
        else setLines(data as InvoiceLine[])
      })
    return () => { active = false }
  }, [selected])

  async function share() {
    if (!selected) return
    const text = [
      'Invoice #' + selected.invoice_no,
      selected.recipient_snapshot?.name || 'Retail',
      'Total: ' + money(selected.total),
      'Collected: ' + money(selected.collected),
      'Balance: ' + money(selected.outstanding),
    ].join('\n')
    try {
      if (navigator.share) await navigator.share({ title: 'Invoice #' + selected.invoice_no, text })
      else {
        await navigator.clipboard.writeText(text)
        setNotice('Invoice summary copied.')
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') setError(error.message)
    }
  }

  const shown = invoices?.filter(invoice => filter === 'All orders' || Number(invoice.outstanding) > 0)

  return <main>
    {selected ? <>
      <button className="link" onClick={() => { setSelected(undefined);setParams({}); setLines(undefined); setNotice('') }}>Back to orders</button>
      <section className="invoice-paper">
        <div className="row"><h2>Invoice #{selected.invoice_no}</h2><span className="tag">{selected.payment_status}</span></div>
        <p className="muted">{selected.recipient_snapshot?.name || 'Historical retail'} · {day(selected.created_at)}</p>
        {!lines ? <p role="status">Loading invoice…</p> : lines.map(line =>
          <div className="summary-line" key={line.id}><span>
            {line.product_snapshot?.sku || line.product_snapshot?.product_line || 'Historical product'}
            <small className="muted"> · {line.quantity} × {money(line.unit_price)}</small>
          </span><strong>{money(line.line_total)}</strong></div>)}
        <div className="summary-line"><span>Total</span><strong>{money(selected.total)}</strong></div>
        <div className="summary-line"><span>Collected</span><strong>{money(selected.collected)}</strong></div>
        <div className="summary-line"><span>Balance</span><strong>{money(selected.outstanding)}</strong></div>
      </section>
      <button className="primary" onClick={() => void share()}>Share invoice summary</button>
      <Link className="button" to={(embedded?'/admin/collections?invoice=':'/admin?invoice=') + selected.id}>Manage collections and reminders</Link>
    </> : <>
      <nav className="retail-tabs" aria-label="Order list">
        {['All orders', 'Pending invoices'].map(value =>
          <button key={value} aria-pressed={value === filter} onClick={() => setFilter(value)}>{value}</button>)}
      </nav>
      {!invoices && !error && <p role="status">Loading orders…</p>}
      {shown?.length === 0 && <div className="empty"><img src="/wireframe/orders.svg" alt="" />
        <h2>{filter === 'Pending invoices' ? 'No pending invoices' : 'No orders yet'}</h2>
        <p>Choose a retail to create an order.</p><Link className="button primary" to="/">Open retails</Link></div>}
      <ul className="list">{shown?.map(invoice => <li key={invoice.id}>
        <button className="card card-link wide" onClick={() => { setSelected(invoice); setError('') }}>
          <span><strong>{invoice.recipient_snapshot?.name || 'Invoice #' + invoice.invoice_no}</strong><br />
            <small className="muted">#{invoice.invoice_no} · {day(invoice.created_at)}<br />Balance {money(invoice.outstanding)}</small></span>
          <span className={'tag ' + (invoice.payment_status === 'Paid' ? 'ok' : 'warn')}>{invoice.payment_status}</span>
        </button>
      </li>)}</ul>
    </>}
    {error && <p className="error" role="alert">{error}</p>}
    {notice && <p className="ok-text" role="status">{notice}</p>}
  </main>
}

export function OwnerProfile({ userId, embedded=false, onChanged }: { userId: string; embedded?:boolean;onChanged?:()=>void }) {
  const [profile, setProfile] = useState<{ full_name: string; phone: string | null }>()
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    void supabase?.from('profiles').select('full_name,phone').eq('id', userId).single()
      .then(({ data, error }) => {
        if (!active) return
        if (error) setError(error.message)
        else setProfile(data)
      })
    return () => { active = false }
  }, [userId])
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || busy) return
    const data = new FormData(event.currentTarget)
    const name = String(data.get('name') || '').trim()
    if (!name) { setError('Enter your full name.'); return }
    setBusy(true); setError(''); setNotice('')
    const { error } = await supabase.from('profiles').update({
      full_name: name, phone: String(data.get('phone') || '').trim() || null,
    }).eq('id', userId)
    if (error) setError(error.message)
    else {setProfile({full_name:name,phone:String(data.get('phone')||'').trim()||null});setNotice('Profile updated.');onChanged?.()}
    setBusy(false)
  }
  return <main>
    <div className="card"><p className="muted">Owner profile</p><h2 className="owner-name">{profile?.full_name || 'Your account'}</h2></div>
    {!profile && !error && <p role="status">Loading profile…</p>}
    {profile && <form className="form" onSubmit={event => void save(event)}>
      <label>Full name<input name="name" defaultValue={profile.full_name} autoComplete="name" required /></label>
      <label>Phone<input name="phone" type="tel" defaultValue={profile.phone ?? ''} autoComplete="tel" /></label>
      <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>
    </form>}
    {!embedded && <div className="profile-links">
      <Link className="card card-link" to="/admin">Admin hub <span aria-hidden="true">→</span></Link>
      <Link className="card card-link" to="/orders">Invoices and collections <span aria-hidden="true">→</span></Link>
      <button onClick={() => void supabase?.auth.signOut()}>Sign out</button>
    </div>}
    {error && <p className="error" role="alert">{error}</p>}
    {notice && <p className="ok-text" role="status">{notice}</p>}
  </main>
}
