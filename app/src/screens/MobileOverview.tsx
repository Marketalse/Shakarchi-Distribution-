import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { adminRows, adminSummary, percentOf, type AdminData, type AdminPeriod } from '../lib/admin-data'
import { formatUsd, formatUsdSummary, usdCents } from '../lib/money'
import { MobileIcon } from './MobileIcon'

type OverviewData = Pick<AdminData, 'clients' | 'invoices' | 'cash' | 'reminders'>
const periods: [AdminPeriod, string][] = [['today', 'Today'], ['week', 'This week'], ['month', 'This month']]

export function MobileOverview({ version }: { version: number }) {
  const [period, setPeriod] = useState<AdminPeriod>('month')
  const [state, setState] = useState<{ version: number; data?: OverviewData; at?: Date; error?: string }>({ version })
  useEffect(() => {
    let active = true
    const client = supabase
    async function load(): Promise<OverviewData> {
      if (!client) throw Error('The database connection is unavailable.')
      const [clients, invoices, cash, reminders] = await Promise.all([
        adminRows<OverviewData['clients'][number]>(client, 'outlets', '*'),
        adminRows<OverviewData['invoices'][number]>(client, 'solo_invoice_balances', 'id,invoice_no,outlet_id,total,collected,outstanding,overpayment,due_date,payment_status,recipient_snapshot,created_at'),
        adminRows<OverviewData['cash'][number]>(client, 'payments', 'id,order_id,amount,collected_at,entry_type,method,note'),
        adminRows<OverviewData['reminders'][number]>(client, 'collection_reminders', 'order_id,status,scheduled_at', 'order_id'),
      ])
      return { clients, invoices, cash, reminders }
    }
    void load().then(data => { if (active) setState({ version, data, at: new Date() }) }, error => {
      if (active) setState({ version, error: error instanceof Error ? error.message : String(error?.message || error) })
    })
    return () => { active = false }
  }, [version])
  const result = useMemo(() => {
    if (state.version !== version || !state.data || !state.at) return undefined
    try { return { summary: adminSummary(state.data, period, state.at) } }
    catch (error) { return { error: error instanceof Error ? error.message : String(error) } }
  }, [state, period, version])
  const summary = result?.summary
  const error = state.version === version ? state.error || result?.error : undefined
  const chartMaximum = summary?.chart.reduce((maximum, bucket) => usdCents(bucket.total) > usdCents(maximum) ? bucket.total : maximum, '0.00') || '0.00'
  return <main className="mobile-overview">
    <nav className="period-filters" aria-label="Sales period">{periods.map(([value, label]) => <button key={value} aria-pressed={value === period} onClick={() => setPeriod(value)}>{label}</button>)}</nav>
    {error && <p className="error" role="alert">{error}</p>}
    {!summary && !error && <p role="status">Loading your overview…</p>}
    <section className="sales-hero" aria-label="Sales summary"><p>Total sales · {periods.find(([key]) => key === period)?.[1]}</p><strong title={summary ? formatUsd(summary.sales) : undefined}>{summary ? formatUsdSummary(summary.sales) : '—'}</strong><span>USD</span>
      {summary && <div className="sales-spark" aria-label="Daily sales; open detailed report for amounts">{summary.chart.map(bucket => <span key={bucket.day} title={bucket.day + ': ' + formatUsd(bucket.total)} style={{ height: Math.max(2, percentOf(bucket.total, chartMaximum)) + '%' }} />)}</div>}
      <Link to="/reports">View detailed report <span aria-hidden="true">→</span></Link>
    </section>
    <div className="overview-metrics"><Link to="/orders" className="overview-metric soft"><MobileIcon name="wallet" size={22} /><span>Outstanding</span><strong title={summary ? formatUsd(summary.report.outstanding) : undefined}>{summary ? formatUsdSummary(summary.report.outstanding) : '—'}</strong></Link><Link to="/" className="overview-metric"><MobileIcon name="shop" size={22} /><span>Clients</span><strong>{summary ? summary.activeClients : '—'}</strong></Link></div>
    <div className="row section-heading"><h2>Needs your attention</h2><Link to="/admin/collections">View all</Link></div>
    {summary && (summary.report.due.length ? <ul className="list">{summary.report.due.slice(0, 3).map(reminder => <li key={reminder.order_id}><Link to={'/admin/collections?invoice=' + reminder.order_id} className="attention-card"><span className="attention-icon"><MobileIcon name="wallet" /></span><span><strong>{reminder.invoice.recipient_snapshot?.name || 'Invoice #' + reminder.invoice.invoice_no}</strong><span className="muted">Payment reminder · {formatUsd(reminder.invoice.outstanding)}</span></span><MobileIcon name="chevron" size={18} /></Link></li>)}</ul> : <div className="card calm-state"><MobileIcon name="check" size={22} /><p>No payment reminders due.</p></div>)}
    <Link className="button primary" to="/outlets/new"><MobileIcon name="plus" size={20} />New client</Link>
  </main>
}
