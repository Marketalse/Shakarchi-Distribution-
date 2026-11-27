import {InvoicePdfActions} from './InvoicePdfActions'
import {RetailTag} from './RetailTag'
import {invoiceRetailReference} from '../lib/retail-reference'
import type {Outlet} from '../lib/types'
import {liveQuery} from 'dexie'
import {db} from '../lib/db'
import {fieldTable} from '../lib/offline'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { MobileIcon } from './MobileIcon'
import { invoiceItem, invoiceQuantity, invoiceUnit, invoiceSellingPrice, type ProductSnapshot } from '../lib/invoice-display'
import '../invoice.css'
import { formatUsd } from '../lib/money'
import { supabase } from '../lib/supabase'

type Invoice = {
  id: string; invoice_no: number; outlet_id: string; total: string
  collected: string; outstanding: string; payment_status: string
  created_at: string; recipient_snapshot: { name?: string } | null
}
type InvoiceLine = {
  id: string; quantity: number; unit_price: string; line_total: string
  product_snapshot: ProductSnapshot | null
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
  const [retails,setRetails]=useState<Outlet[]>([])
  useEffect(()=>{const sub=liveQuery(()=>db.outlets.toArray()).subscribe({next:setRetails,error:()=>setRetails([])});return()=>sub.unsubscribe()},[])
  const [lineState, setLineState] = useState<{id:string;rows?:InvoiceLine[];error?:string;clientName?:string}>()
  const [filter, setFilter] = useState('Pending invoices')
  const [selected, setSelected] = useState<Invoice>()
  const lines=lineState?.id===selected?.id ? lineState?.rows : undefined
  const lineError=lineState?.id===selected?.id ? lineState?.error : undefined
  const logo=import.meta.env.VITE_COMPANY_LOGO_URL as string | undefined
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      if (!supabase) throw Error('The database connection is unavailable.')
      let cached=await fieldTable<Invoice>(db,'solo_invoice_balances')
      if(invoiceId && !cached?.some(i=>i.id===invoiceId) && navigator.onLine)cached=undefined
      const result: Invoice[] = cached??[]
      if(!cached)for (let offset = 0; ; offset += 500) {
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

  useEffect(()=>{const sub=liveQuery(()=>fieldTable<Invoice>(db,'solo_invoice_balances')).subscribe({next:rows=>{if(rows){setInvoices(rows);if(invoiceId){const found=rows.find(row=>row.id===invoiceId);if(found){setSelected(found);setError('')}}}},error:e=>setError(fail(e))});return()=>sub.unsubscribe()},[invoiceId])

  useEffect(() => {
    if (!selected) return
    let active = true
    async function loadLines() {
      if(!supabase)throw Error('The database connection is unavailable.')
      const cache=await fieldTable<InvoiceLine & {order_id:string}>(db,'order_lines')
      const saved=cache?.filter(l=>l.order_id===selected!.id)
      if(!saved?.length && !navigator.onLine)throw Error('These invoice items have not been downloaded yet. Sync online first.')
      const result=saved?.length ? {data:saved,error:null} : await supabase.from('order_lines').select('id,quantity,unit_price,line_total,product_snapshot').eq('order_id',selected!.id).order('id')
      const {data,error}=result;if(error)throw error
      let clientName:string|undefined
      if(!selected!.recipient_snapshot?.name){clientName=(await db.outlets.get(selected!.outlet_id))?.retail_name}
      if(!selected!.recipient_snapshot?.name && !clientName && navigator.onLine){const client=await supabase.from('outlets').select('retail_name').eq('id',selected!.outlet_id).maybeSingle();if(!client.error)clientName=client.data?.retail_name}
      if(active)setLineState({id:selected!.id,rows:data as InvoiceLine[],clientName})
    }
    void loadLines().catch(error=>{if(active){setLineState({id:selected!.id,error:fail(error)});setError(fail(error))}})
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
      <button className="link" onClick={() => { setSelected(undefined);setParams({}); setLineState(undefined); setNotice('') }}>Back to orders</button>
      <p><RetailTag {...invoiceRetailReference(selected,retails)}/></p>
      <section className="invoice-paper invoice-receipt" aria-label="Invoice receipt">
        <header className="invoice-brand">{logo && <img src={logo} alt="Shakarchi Distribution logo" onError={event=>{event.currentTarget.hidden=true}} />}<strong>Shakarchi Distribution</strong></header>
        <div className="row"><h2>Invoice #{selected.invoice_no}</h2><span className="tag">{selected.payment_status}</span></div>
        <div className="invoice-recipient"><small className="muted">Bill to</small><h3>{selected.recipient_snapshot?.name || (lineState?.id===selected.id && lineState.clientName) || 'Client name unavailable'}</h3><p className="muted">{day(selected.created_at)}</p></div>
        {!lines ? lineError ? <p>Invoice items could not be loaded.</p> : <p role="status">Loading invoice…</p> : <table className="invoice-items"><caption className="sr-only">Receipt item details in USD</caption><thead><tr><th>Item</th><th>Brand · type</th><th>Unit price · USD</th><th>Qty</th><th>Amount · USD</th></tr></thead><tbody>{lines.map(line=>{const item=invoiceItem(line.product_snapshot);return <tr key={line.id}><td data-label="Item">{item.name}</td><td data-label="Brand · type">{[item.brand,item.mode].filter(Boolean).join(' · ')||'—'}</td><td data-label="Unit price · USD">{money(invoiceSellingPrice(line.product_snapshot,line.unit_price))}{invoiceUnit(line.product_snapshot)}</td><td data-label="Qty">{invoiceQuantity(line.product_snapshot,line.quantity)}</td><td data-label="Amount · USD">{money(line.line_total)}</td></tr>})}</tbody></table>}
        <div className="invoice-totals" aria-label="Invoice amounts">
          <div className="invoice-amount-line"><span>Requested amount</span><strong>{money(selected.total)}</strong></div>
          <div className="invoice-amount-line"><span>Collected to date</span><strong>{money(selected.collected)}</strong></div>
          <div className="invoice-amount-line invoice-remaining"><span>Remaining debt</span><strong>{money(selected.outstanding)}</strong></div>
        </div>
      </section>
      <InvoicePdfActions invoiceId={selected.id}/><button onClick={() => void share()}>Share text summary</button>
      {embedded&&<Link className="button" to={(embedded?'/admin/collections?invoice=':'/admin?invoice=') + selected.id}>Manage collections and reminders</Link>}
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
          <span><RetailTag {...invoiceRetailReference(invoice,retails)}/><br />
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
    <div className="card account-card"><span className="account-avatar"><MobileIcon name="user" size={26} /></span><div><h2 className="owner-name">{profile?.full_name || 'Your account'}</h2><p className="muted">Owner · Admin</p></div></div>
    {!profile && !error && <p role="status">Loading profile…</p>}
    {profile && <details className="profile-editor" open={embedded || undefined}><summary><MobileIcon name="edit" size={22} />Edit profile</summary><form className="form" onSubmit={event => void save(event)}>
      <label>Full name<input name="name" defaultValue={profile.full_name} autoComplete="name" required /></label>
      <label>Phone<input name="phone" type="tel" defaultValue={profile.phone ?? ''} autoComplete="tel" /></label>
      <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>
    </form></details>}
    {!embedded && <div className="profile-links">
      <Link className="card card-link" to="/admin"><MobileIcon name="settings" />Admin hub <span aria-hidden="true">→</span></Link>
      <Link className="card card-link" to="/orders"><MobileIcon name="invoice" />Invoices and collections <span aria-hidden="true">→</span></Link>
      <Link className="card card-link" to="/admin/catalog"><MobileIcon name="box" />Products and brands <span aria-hidden="true">→</span></Link>
      <Link className="card card-link" to="/reports"><MobileIcon name="chart" />Reports <span aria-hidden="true">→</span></Link>
      <button className="button" onClick={() => void supabase?.auth.signOut()}><MobileIcon name="logout" size={20} />Sign out</button>
    </div>}
    {error && <p className="error" role="alert">{error}</p>}
    {notice && <p className="ok-text" role="status">{notice}</p>}
  </main>
}
