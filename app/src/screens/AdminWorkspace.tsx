import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { liveQuery } from 'dexie';
import { supabase } from '../lib/supabase';
import { db } from '../lib/db';
import { adminInvoiceLabel, formatAdminDate, adminSummary, loadAdminData, percentOf, type AdminData, type AdminInvoice, type AdminPeriod } from '../lib/admin-data';
import { formatUsd, formatUsdSummary, sumUsd, usdCents } from '../lib/money';
import { currentReport } from '../lib/reporting';
import { AdminClients } from './AdminClients';
import { NewOutlet } from './NewOutlet';
import { Orders, OwnerProfile } from './OwnerPages';
import { OwnerAdmin } from './OwnerAdmin';
import { ServiceAreas } from './ServiceAreas';
import '../admin.css';
import { fieldWebsite } from '../lib/app-links';
type Workspace = {
  data: AdminData;
  userId: string;
  refresh: () => void;
  pending: {
    surveys: number;
    imports: number;
  };
  period: AdminPeriod;
  clock: number;
};
const WorkspaceContext = createContext<Workspace | null>(null);
const useWorkspace = () => {
  const value = useContext(WorkspaceContext);
  if (!value) throw Error('Admin workspace unavailable');
  return value;
};
const date = formatAdminDate;
const fail = (error: unknown) => error instanceof Error ? error.message : String(error);
const descriptions: Record<string, [string, string]> = {
  overview: ['Overview', 'Your distribution business, at a glance.'],
  clients: ['Clients', 'Manage your retail network and client profiles.'],
  orders: ['Orders & invoices', 'Review invoices and collection balances.'],
  collections: ['Collections', 'A focused workspace for payment follow-up.'],
  catalog: ['Catalog', 'Your existing product and brand records.'],
  surveys: ['Surveys & observations', 'Published forms and competitor intelligence.'],
  imports: ['Imports', 'Review your data before applying a batch.'],
  areas: ['Service areas', 'Manage active choices for new client capture.'],
  settings: ['Workspace settings', 'Owner profile and manual exchange rates.'],
  search: ['Search', 'Find clients, invoices and product records.']
};
const navigation = [['', 'Overview', 'home'], ['clients', 'Clients', 'shop'], ['orders', 'Orders', 'cart'], ['collections', 'Collections', 'wallet'], ['catalog', 'Catalog', 'box'], ['surveys', 'Surveys', 'chart'], ['imports', 'Imports', 'upload'], ['settings', 'Settings', 'settings']];
export function AdminIcon({
  name
}: {
  name: string;
}) {
  const paths: Record<string, string> = {
    home: 'M3 10 12 3l9 7v11h-7v-7h-4v7H3Z',
    shop: 'M4 10v11h16V10M3 3h18l-1 7H4L3 3Zm6 18v-7h6v7',
    cart: 'M2 3h3l3 13h11l3-10H6m3 14h1m8 0h1',
    wallet: 'M3 6h17v15H3V6Zm0 0 14-4v4m-2 6h6v5h-6z',
    box: 'm3 7 9-5 9 5v10l-9 5-9-5V7Zm0 0 9 5 9-5m-9 5v10',
    chart: 'M3 3v18h18M7 16v-5m5 5V7m5 9v-9',
    upload: 'M12 16V3m-5 5 5-5 5 5M3 15v6h18v-6',
    settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-6v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',
    search: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 6 6',
    bell: 'M5 17h14l-2-3V8a5 5 0 0 0-10 0v6l-2 3Zm5 4h4',
    back: 'm14 5-7 7 7 7',
    refresh: 'M20 8a8 8 0 1 0 1 7M20 2v6h-6',
    check: 'm5 12 4 4L20 5',
    menu: 'M3 5h18M3 12h18M3 19h18'
  };
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
<path d={paths[name] ?? paths.box} />
</svg>;
}
function Panel({
  title,
  action,
  children,
  className = ''
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return <section className={'admin-panel ' + className}>
<div className="admin-panel-heading">
<h2>{title}</h2>{action}</div>{children}</section>;
}
function Metric({
  label,
  value,
  detail
}: {
  label: string;
  value: ReactNode;
  detail: string;
}) {
  return <div className="admin-metric">
<span>{label}</span>
<strong>{value}</strong>
<small>{detail}</small>
</div>;
}
function Status({
  value
}: {
  value: string;
}) {
  return <span className={'admin-badge ' + (value === 'Paid' || value === 'Active' ? 'good' : value === 'Unpaid' || value === 'Inactive' ? 'attention' : 'neutral')}>{value}</span>;
}
function InvoiceTable({
  rows,
  compact = false
}: {
  rows: AdminInvoice[];
  compact?: boolean;
}) {
  const {
    data
  } = useWorkspace();
  return !rows.length ? <p className="admin-empty">No invoices match this view.</p> : <div className="admin-table-scroll">
<table className="admin-table">
<thead>
<tr>
<th>Invoice</th>
<th>Client</th>{!compact && <th>Issued</th>}<th>Total</th>{!compact && <th>Balance</th>}<th>Payment status</th>
</tr>
</thead>
<tbody>{rows.map(invoice => <tr key={invoice.id}>
<td>
<Link to={'/admin/orders?invoice=' + invoice.id}>{adminInvoiceLabel(invoice)}</Link>
</td>
<td>{invoice.recipient_snapshot?.name || data.clients.find(c => c.id === invoice.outlet_id)?.retail_name || 'Historical client'}</td>{!compact && <td>{date(invoice.created_at)}</td>}<td>{formatUsd(invoice.total)}</td>{!compact && <td>{formatUsd(invoice.outstanding)}</td>}<td>
<Status value={invoice.payment_status} />
</td>
</tr>)}</tbody>
</table>
</div>;
}
function Overview() {
  const {
      data,
      pending,
      period,
      clock
    } = useWorkspace(),
    summary = adminSummary(data, period, new Date(clock));
  const periodLabel = period === 'week' ? 'Last 7 days' : period === 'month' ? 'This month' : 'All recorded dates';
  const max = summary.chart.reduce((v, b) => usdCents(b.total) > usdCents(v) ? b.total : v, '0.00');
  const collectionProgress = percentOf(summary.allocated, summary.invoiced);
  return <>
  <div className="admin-metrics four">
<Metric label="Sales · USD" value={<span title={formatUsd(summary.sales)}>{formatUsdSummary(summary.sales)}</span>} detail={summary.invoiceCount + ' invoices · ' + periodLabel} />
<Metric label="Net cash · USD" value={<span title={formatUsd(summary.cash)}>{formatUsdSummary(summary.cash)}</span>} detail={periodLabel + ' · refunds included'} />
<Metric label="Outstanding · USD" value={formatUsd(summary.report.outstanding)} detail="Current balance · all invoices" />
<Metric label="Active clients" value={summary.activeClients} detail="Current retail network" />
</div>
  {summary.report.discrepancy !== '0.00' && <p role="alert" className="error">Payment reconciliation required: {formatUsd(summary.report.discrepancy)} difference. Refresh before relying on this report.</p>}
  {summary.report.unallocatedCash !== '0.00' && <p className="warn-text">Unallocated cash {formatUsd(summary.report.unallocatedCash)} is separate from invoice collection progress.</p>}
  <div className="admin-grid">
<Panel title="Sales performance" action={<span className="admin-badge">{period === 'all' ? 'Last 30 days' : periodLabel}</span>}>
<p className="admin-subtle">Invoiced sales · USD · Baghdad dates</p>
<div className="admin-chart" role="img" aria-label="Daily invoiced sales in USD">{summary.chart.map((bar, index) => <div className="admin-chart-column" key={bar.day} title={bar.day + ': ' + formatUsd(bar.total)}>
<div className="admin-bar-track">
<span className={index === summary.chart.length - 1 ? 'last' : ''} style={{
                height: (usdCents(bar.total) > 0n ? Math.max(1, percentOf(bar.total, max)) : 0) + '%'
              }} />
</div>
<small>{bar.day.slice(8)}</small>
</div>)}</div>
<details className="admin-chart-values">
<summary>Daily values</summary>
<ul>{summary.chart.map(b => <li key={b.day}>{b.day}: {formatUsd(b.total)}</li>)}</ul>
</details>
</Panel>
  <Panel title="Collection progress">
<strong className="admin-big-number">{formatUsd(summary.allocated)}</strong>
<p className="admin-subtle">Collected against {formatUsd(summary.invoiced)} invoiced · all time</p>
<progress value={collectionProgress} max="100" aria-label="Allocated invoice collection progress" />
<strong className="admin-progress-caption">{collectionProgress}% of invoiced sales</strong>
<Link className="admin-secondary full" to="/admin/collections">View collections</Link>
</Panel>
</div>
  <div className="admin-grid">
<Panel title="Recent invoices" action={<Link className="admin-secondary" to="/admin/orders">View all</Link>}>
<InvoiceTable rows={[...data.invoices].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5)} compact />
</Panel>
<Panel title="Needs attention">
<Link className="admin-attention" to="/admin/collections">
<span className="admin-count urgent">{summary.report.due.length}</span>
<span>
<strong>Payment follow-ups</strong>
<small>{formatUsd(summary.report.outstanding)} outstanding · current balance</small>
</span>
</Link>
<Link className="admin-attention" to="/admin/surveys">
<span className="admin-count">{pending.surveys}</span>
<span>
<strong>Saved survey responses</strong>
<small>Unfinished or waiting on this device</small>
</span>
</Link>
<Link className="admin-attention" to="/admin/imports">
<span className="admin-count">{pending.imports}</span>
<span>
<strong>Pending imports</strong>
<small>Queued operations on this device</small>
</span>
</Link>
</Panel>
</div>
 </>;
}
function ClientDirectory() {
  const {
      data
    } = useWorkspace(),
    navigate = useNavigate(),
    [query, setQuery] = useState(''),
    [error, setError] = useState('');
  const balances = new Map<string, string[]>();
  data.invoices.forEach(i => balances.set(i.outlet_id, [...(balances.get(i.outlet_id) ?? []), String(i.outstanding)]));
  const shown = data.clients.filter(c => [c.retail_name, c.area, c.province, c.owner_phone ?? ''].some(v => v.toLowerCase().includes(query.trim().toLowerCase())));
  async function openClient(client: AdminData['clients'][number]) {
    try {
      const queued = await db.outbox.where('table').equals('outlets').filter(row => row.row_id === client.id).count();
      if (!queued) await db.outlets.put(client);
      navigate('/admin/clients/' + client.id);
    } catch (e) {
      setError(fail(e));
    }
  }
  return <>
<div className="admin-metrics">
<Metric label="Total clients" value={data.clients.length} detail="Saved client profiles" />
<Metric label="With open balances" value={new Set(data.invoices.filter(i => usdCents(i.outstanding) > 0n).map(i => i.outlet_id)).size} detail="Follow up from Collections" />
<Metric label="Outstanding · USD" value={formatUsd(sumUsd(data.invoices.map(i => i.outstanding)))} detail="Current invoice balances" />
</div>
<Panel title="Client directory">
<input className="admin-filter" type="search" aria-label="Search client directory" placeholder="Search clients or area" value={query} onChange={e => setQuery(e.target.value)} />{error && <p role="alert">{error}</p>}<div className="admin-table-scroll">
<table className="admin-table">
<thead>
<tr>
<th>Client</th>
<th>Location</th>
<th>Outlet type</th>
<th>Balance</th>
<th>Status</th>
</tr>
</thead>
<tbody>{shown.map(c => <tr key={c.id}>
<td>
<button className="admin-text-button" onClick={() => void openClient(c)}>{c.retail_name}</button>
</td>
<td>{[c.province, c.area].filter(Boolean).join(' · ')}</td>
<td>{c.outlet_type}</td>
<td>{formatUsd(sumUsd(balances.get(c.id) ?? []))}</td>
<td>
<Status value={c.archived_at ? 'Archived' : 'Active'} />
</td>
</tr>)}</tbody>
</table>
</div>{!shown.length && <p className="admin-empty">No clients match this search.</p>}</Panel>
</>;
}
function InvoiceRegister() {
  const {
      data
    } = useWorkspace(),
    [params] = useSearchParams(),
    [query, setQuery] = useState(''),
    [status, setStatus] = useState('All');
  if (params.get('invoice')) return <Orders embedded />;
  const shown = data.invoices.filter(i => (status === 'All' || i.payment_status === status) && [adminInvoiceLabel(i), i.recipient_snapshot?.name ?? ''].some(v => v.toLowerCase().includes(query.trim().toLowerCase())));
  return <>
<div className="admin-metrics">
<Metric label="Invoiced · USD" value={formatUsd(sumUsd(data.invoices.map(i => i.total)))} detail={data.invoices.length + ' invoices · all time'} />
<Metric label="Allocated collections · USD" value={formatUsd(sumUsd(data.invoices.map(i => i.collected)))} detail="Linked to invoices · all time" />
<Metric label="Open balance · USD" value={formatUsd(sumUsd(data.invoices.map(i => i.outstanding)))} detail="Current invoice balances" />
</div>
<Panel title="Invoice register">
<div className="admin-toolbar">
<input type="search" aria-label="Search invoices" placeholder="Search invoices or client" value={query} onChange={e => setQuery(e.target.value)} />
<select aria-label="Payment status" value={status} onChange={e => setStatus(e.target.value)}>{['All', 'Paid', 'Partially paid', 'Unpaid'].map(s => <option key={s}>{s}</option>)}</select>
</div>
<InvoiceTable rows={[...shown].sort((a, b) => b.created_at.localeCompare(a.created_at))} />
</Panel>
</>;
}
function Collections() {
  const {
      data,
      refresh,
      clock
    } = useWorkspace(),
    [params] = useSearchParams();
  const report = currentReport(data.invoices, data.cash, data.reminders, new Date(clock));
  if (params.get('invoice')) return <OwnerAdmin key={params.get('invoice')} section="Collections" embedded onChanged={refresh} />;
  return <>
<div className="admin-metrics">
<Metric label="Outstanding · USD" value={formatUsd(report.outstanding)} detail="Current open balances" />
<Metric label="Net cash · USD" value={formatUsd(report.netCash)} detail="All time · signed ledger entries" />
<Metric label="Follow-ups due" value={report.due.length} detail="Scheduled payment reminders" />
</div>
<Panel title="Collection reminders">
<div className="admin-table-scroll">
<table className="admin-table">
<thead>
<tr>
<th>Invoice</th>
<th>Client</th>
<th>Next reminder</th>
<th>To collect</th>
<th>Action</th>
</tr>
</thead>
<tbody>{data.invoices.filter(i => usdCents(i.outstanding) > 0n).map(i => {
              const reminder = data.reminders.find(r => r.order_id === i.id);
              return <tr key={i.id}>
<td>
<Link to={'/admin/orders?invoice=' + i.id}>{adminInvoiceLabel(i)}</Link>
</td>
<td>{i.recipient_snapshot?.name || 'Historical client'}</td>
<td>{reminder?.scheduled_at ? date(reminder.scheduled_at) : 'Not scheduled'}</td>
<td>{formatUsd(i.outstanding)}</td>
<td>
<Link to={'/admin/collections?invoice=' + i.id}>Open follow-up →</Link>
</td>
</tr>;
            })}</tbody>
</table>
</div>{!data.invoices.some(i => usdCents(i.outstanding) > 0n) && <p className="admin-empty">No outstanding invoices.</p>}</Panel>
<Panel title="Collection history">
<div className="admin-table-scroll">
<table className="admin-table">
<thead>
<tr>
<th>Recorded</th>
<th>Event</th>
<th>Amount · USD</th>
<th>Invoice</th>
</tr>
</thead>
<tbody>{[...data.cash].sort((a, b) => b.collected_at.localeCompare(a.collected_at)).map(row => <tr key={row.id}>
<td>{date(row.collected_at)}</td>
<td>{row.entry_type}</td>
<td>{formatUsd(row.amount)}</td>
<td>{row.order_id ? <Link to={'/admin/collections?invoice=' + row.order_id}>History & corrections</Link> : 'Unallocated'}</td>
</tr>)}</tbody>
</table>
</div>{!data.cash.length && <p className="admin-empty">No cash entries recorded.</p>}</Panel>
</>;
}
function Surveys() {
  const {
    data
  } = useWorkspace();
  return <>
<div className="admin-metrics">
<Metric label="Published forms" value={data.surveys.length} detail="Immutable survey versions" />
<Metric label="Responses" value={data.runs.length} detail="Submitted records" />
<Metric label="Observations" value={data.observations.length} detail="Competitor market intelligence" />
</div>
<Panel title="Survey library" action={<Link className="admin-primary" to="/admin/surveys/new">+ Create survey</Link>}>
<div className="admin-table-scroll">
<table className="admin-table">
<thead>
<tr>
<th>Survey</th>
<th>Published</th>
<th>Questions</th>
<th>Responses</th>
<th>Status</th>
</tr>
</thead>
<tbody>{data.surveys.map(s => <tr key={s.id}>
<td>{s.title}</td>
<td>{date(s.created_at)}</td>
<td>{s.questions.length}</td>
<td>{data.runs.filter(r => r.version_id === s.id).length}</td>
<td>
<Status value="Published" />
</td>
</tr>)}</tbody>
</table>
</div>{!data.surveys.length && <p className="admin-empty">No published forms yet. Create one when your survey questions are ready.</p>}<Link className="admin-secondary" to="/admin/surveys/observations">View responses & observations</Link>
</Panel>
</>;
}
function Search() {
  const {
      data
    } = useWorkspace(),
    [params] = useSearchParams(),
    q = (params.get('q') ?? '').trim().toLowerCase();
  const clients = q ? data.clients.filter(c => [c.retail_name, c.area, c.province].some(v => v.toLowerCase().includes(q))) : [];
  const invoices = q ? data.invoices.filter(i => [adminInvoiceLabel(i), i.recipient_snapshot?.name ?? ''].some(v => v.toLowerCase().includes(q))) : [];
  const products = q ? data.products.filter(p => [p.flavour, p.product_line, p.brand ?? '', p.sku ?? ''].some(v => v.toLowerCase().includes(q))) : [];
  return <>
<Panel title="Clients">{clients.map(c => <Link className="admin-search-result" key={c.id} to={'/admin/clients/' + c.id}>{c.retail_name}<small>{c.area}</small>
</Link>)}{!clients.length && <p>No matching clients.</p>}</Panel>
<Panel title="Invoices">
<InvoiceTable rows={invoices} />
</Panel>
<Panel title="Product records">{products.map(p => <Link className="admin-search-result" key={p.id} to="/admin/catalog">
<span>{p.flavour || p.product_line}</span>
<small>{p.brand} · {p.product_line}</small>
</Link>)}{!products.length && <p>No matching product records.</p>}</Panel>
</>;
}
function Catalog() {
  const {
      data,
      refresh
    } = useWorkspace(),
    [params] = useSearchParams(),
    [query, setQuery] = useState(''),
    [brand, setBrand] = useState('All');
  const section = params.get('section') === 'brands' ? 'Brands' : 'Products';
  if (section === 'Brands') return <>
<Link className="admin-secondary" to="/admin/catalog">Back to catalog</Link>
<OwnerAdmin section="Brands" embedded onChanged={refresh} />
</>;
  const shown = data.products.filter(p => (brand === 'All' || p.brand === brand) && [p.flavour, p.product_line].some(v => v.toLowerCase().includes(query.trim().toLowerCase())));
  return <Panel title="Product records" action={<div className="admin-toolbar">
<Link className="admin-secondary" to="/admin/catalog?section=brands">Manage brands</Link>
<Link className="admin-primary" to="/admin/catalog/new">Add product</Link>
</div>}>
<div className="admin-toolbar">
<input type="search" aria-label="Search product records" placeholder="Search product names or lines" value={query} onChange={e => setQuery(e.target.value)} />
<select aria-label="Filter product brand" value={brand} onChange={e => setBrand(e.target.value)}>
<option>All</option>{[...new Set(data.products.map(p => p.brand).filter(Boolean))].sort().map(b => <option key={b!}>{b}</option>)}</select>
</div>
<div className="admin-table-scroll">
<table className="admin-table">
<thead>
<tr>
<th>Product</th>
<th>Brand</th>
<th>Product line</th>
<th>Classification</th>
<th>Status</th>
<th>Record</th>
</tr>
</thead>
<tbody>{[...shown].sort((a, b) => [a.brand, a.product_line, a.flavour].join().localeCompare([b.brand, b.product_line, b.flavour].join())).map(p => <tr key={p.id}>
<td>{p.flavour || p.product_line}</td>
<td>{p.brand || 'Unassigned'}</td>
<td>{p.product_line}</td>
<td>{p.is_own_brand ? 'Our catalog' : 'Competitor'}</td>
<td>
<Status value={p.active ? 'Active' : 'Inactive'} />
</td>
<td>
<Link to={'/admin/catalog/edit/' + p.id}>Open record</Link>
</td>
</tr>)}</tbody>
</table>
</div>{!shown.length && <p className="admin-empty">No product records match this view.</p>}</Panel>;
}
function ProductEditor() {
  const {
      productId
    } = useParams(),
    {
      refresh
    } = useWorkspace();
  return <Panel title={productId ? 'Product record' : 'New product'}>
<OwnerAdmin key={productId || 'new'} section="Products" embedded productId={productId} editorOnly onChanged={refresh} />
</Panel>;
}
function Settings() {
  const {
    userId,
    refresh
  } = useWorkspace();
  return <>
<div className="admin-settings-facts">
<span>Base currency <strong>USD ($)</strong>
</span>
<span>Timezone <strong>Asia/Baghdad</strong>
</span>
<span>Access <strong>Sole owner</strong>
</span>
</div>
<Panel title="Owner profile">
<OwnerProfile userId={userId} embedded onChanged={refresh} />
</Panel>
<Panel title="Service areas"><p className="admin-subtle">Manage new-client choices while preserving saved client locations.</p><Link className="admin-secondary" to="/admin/areas">Manage service areas</Link></Panel>
<Panel title="Manual exchange rate">
<OwnerAdmin section="Exchange rate" embedded onChanged={refresh} />
</Panel>
<button className="admin-secondary" onClick={() => void supabase?.auth.signOut()}>Sign out</button>
</>;
}
export function AdminWorkspace({
  userId,
  onSync,
  syncBusy = false,
  syncError = '',
  pendingCount = 0,
  online = true
}: {
  userId: string;
  onSync: () => Promise<void>;
  syncBusy?: boolean;
  syncError?: string;
  pendingCount?: number;
  online?: boolean;
}) {
  const location = useLocation(),
    navigate = useNavigate(),
    [params] = useSearchParams();
  const [data, setData] = useState<AdminData>(),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0);
  const [clock, setClock] = useState(Date.now);
  const [period, setPeriod] = useState<AdminPeriod>('week'),
    [query, setQuery] = useState(''),
    [name, setName] = useState('Owner admin');
  const [collapsed, setCollapsed] = useState(() => {
      try {
        return localStorage.getItem('wsd-admin-sidebar') === 'collapsed';
      } catch {
        return false;
      }
    }),
    [mobileOpen, setMobileOpen] = useState(false);
  const [pending, setPending] = useState({
    surveys: 0,
    imports: 0
  });
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, []);
  const refresh = () => {
    setLoading(true);
    setRevision(v => v + 1);
  };
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 30000);
    const focused = () => {
      setLoading(true);
      setRevision(v => v + 1);
    };
    window.addEventListener('focus', focused);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', focused);
    };
  }, []);
  useEffect(() => {
    let active = true;
    void (async () => {
      if (!supabase) throw Error('Database connection unavailable.');
      return loadAdminData(supabase);
    })().then(value => {
      if (active) {
        setData(value);
        setError('');
      }
    }, failure => {
      if (active) setError(fail(failure));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [revision]);
  useEffect(() => {
    let active = true;
    void supabase?.from('profiles').select('full_name').eq('id', userId).single().then(({
      data
    }) => {
      if (active && data?.full_name) setName(data.full_name);
    });
    return () => {
      active = false;
    };
  }, [userId, revision]);
  useEffect(() => {
    const subscription = liveQuery(async () => ({
      surveys: await db.capture_drafts.where('owner_id').equals(userId).filter(d => ['queued', 'rejected'].includes(d.status) || d.status === 'editing' && Boolean(d.version_id || d.brand_id || Object.keys(d.raw_answers).length)).count(),
      imports: await db.commands.where('owner_id').equals(userId).filter(c => c.rpc === 'import_solo_data').count()
    })).subscribe({
      next: setPending,
      error: failure => setError('Device queue could not be read: ' + fail(failure))
    });
    return () => subscription.unsubscribe();
  }, [userId]);
  const segment = location.pathname.split('/')[2] || 'overview';
  const heading = location.pathname.endsWith('/clients/new') ? ['New client', 'Capture store details and save its location once.'] : location.pathname.includes('/clients/') ? ['Client profile', 'Manage this client from the owner workspace.'] : location.pathname.endsWith('/surveys/new') ? ['Survey builder', 'Compose questions and publish an immutable version.'] : location.pathname.endsWith('/surveys/observations') ? ['Responses & observations', 'Review submitted field data.'] : descriptions[segment] ?? descriptions.overview;
  const initials = name.trim().split(/\s+/).map(n => n[0]).slice(0, 2).join('').toUpperCase();
  async function sync() {
    await onSync();
    refresh();
  }
  function search(e: FormEvent) {
    e.preventDefault();
    if (query.trim()) navigate('/admin/search?q=' + encodeURIComponent(query.trim()));
  }
  function collapse() {
    setCollapsed(v => {
      try {
        localStorage.setItem('wsd-admin-sidebar', v ? 'expanded' : 'collapsed');
      } catch {/* preference only */}
      return !v;
    });
  }
  return <div className={'admin-workspace' + (collapsed ? ' is-collapsed' : '') + (mobileOpen ? ' mobile-open' : '')}>
  <aside className="admin-sidebar" id="admin-sidebar">
<div className="admin-sidebar-brand">
<Link to="/admin" aria-label="Raff overview">{collapsed ? 'r.' : 'raff.'}</Link>
<button aria-label={mobileOpen ? 'Close admin menu' : collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => mobileOpen ? setMobileOpen(false) : collapse()}>
<AdminIcon name="back" />
</button>
</div>
<p className="admin-workspace-label">OWNER WORKSPACE</p>
<nav aria-label="Admin navigation">{navigation.map(([path, label, icon]) => <NavLink end={!path} key={path} to={'/admin' + (path ? '/' + path : '')} title={label} onClick={() => setMobileOpen(false)}>
<AdminIcon name={icon} />
<span>{label}</span>
</NavLink>)}</nav>
<div className="admin-sidebar-footer">
<div className="admin-sidebar-note">
<AdminIcon name="check" />
<strong>Everything in one place</strong>
<span>Sales, collections and market insights.</span>
</div>
<Link className="admin-sidebar-owner" to="/admin/settings">
<span className="admin-avatar">{initials}</span>
<span>
<strong>{name}</strong>
<small>Solo workspace</small>
</span>
</Link>
{fieldWebsite('/dashboard') && <a className="admin-field-link" href={fieldWebsite('/dashboard')}>Open field app →</a>}
</div>
</aside>
  <div className="admin-main">
<div className="admin-breadcrumb">Workspace <span>/</span> {heading[0]}</div>
<header className="admin-topbar">
<button className="admin-mobile-toggle" aria-label="Toggle admin menu" aria-expanded={mobileOpen} aria-controls="admin-sidebar" onClick={() => setMobileOpen(v => !v)}>
<AdminIcon name="menu" />
</button>
<form className="admin-search" onSubmit={search}>
<AdminIcon name="search" />
<input aria-label="Search workspace" placeholder="Search clients, invoices or products" value={query} onChange={e => setQuery(e.target.value)} />
<button type="submit" aria-label="Search workspace records">Search</button>
</form>
<div className="admin-topbar-actions">{segment === 'overview' ? <select aria-label="Overview reporting period" value={period} onChange={e => setPeriod(e.target.value as AdminPeriod)}>
<option value="week">Last 7 days</option>
<option value="month">This month</option>
<option value="all">All time</option>
</select> : <span className="admin-today">{date(new Date(clock).toISOString())}</span>}<button className="admin-refresh" aria-label="Sync and refresh admin data" disabled={syncBusy || loading || !online} onClick={() => void sync()}>
<AdminIcon name="refresh" />
<span>{syncBusy ? 'Syncing' : !online ? 'Offline' : pendingCount ? pendingCount + ' pending' : 'Sync'}</span>
</button>
<Link className="admin-notification" to="/admin/collections" aria-label="Open collection follow-ups">
<AdminIcon name="bell" />{data && <span>{currentReport(data.invoices, data.cash, data.reminders, new Date(clock)).due.length}</span>}</Link>
<Link className="admin-avatar" to="/admin/settings" aria-label="Owner profile">{initials}</Link>
</div>
</header>
   <div className="admin-page-heading">
<div>
<h1>{heading[0]}</h1>
<p>{heading[1]}</p>
</div>{location.pathname === '/admin/clients' && <Link className="admin-primary" to="/admin/clients/new">+ New client</Link>}{segment === 'orders' && <Link className="admin-secondary" to="/admin/clients">Choose client for a new order →</Link>}</div>
   {syncError && <p role="alert" className="error">Sync paused: {syncError}. Pending records are retained.</p>}{error && <div className="admin-error" role="alert">Could not refresh admin data: {error} <button onClick={refresh}>Retry</button>{data && <small>Showing the last successful load from {date(data.loadedAt)}.</small>}</div>}
   {!data ? loading ? <p role="status">Loading your workspace…</p> : null : <WorkspaceContext.Provider value={{
        data,
        userId,
        refresh,
        pending,
        period,
        clock
      }}>
<div className="admin-content" aria-busy={loading}>
<Routes>
    <Route index element={params.get('invoice') ? <Navigate replace to={'collections?invoice=' + encodeURIComponent(params.get('invoice')!)} /> : <Overview />} />
    <Route path="clients" element={<ClientDirectory />} />
<Route path="clients/new" element={<Panel title="New client">
<NewOutlet repId={userId} onSaved={() => void sync()} adminMode />
</Panel>} />
<Route path="clients/:outletId" element={<div className="admin-panel">
<AdminClients embedded onChanged={refresh} />
</div>} />
    <Route path="orders" element={<InvoiceRegister />} />
<Route path="collections" element={<Collections />} />
<Route path="catalog" element={<Catalog />} />
<Route path="catalog/new" element={<ProductEditor />} />
<Route path="catalog/edit/:productId" element={<ProductEditor />} />
    <Route path="surveys" element={<Surveys />} />
<Route path="surveys/new" element={<Panel title="Questions">
<OwnerAdmin section="Surveys" embedded builderOnly onChanged={refresh} />
</Panel>} />
<Route path="surveys/observations" element={<Panel title="Responses & observations">
<OwnerAdmin section="Observations" embedded onChanged={refresh} />
</Panel>} />
    <Route path="imports" element={<Panel title="Review and import JSON data">
<OwnerAdmin section="Imports" embedded onChanged={refresh} />
</Panel>} />
<Route path="areas" element={<div className="admin-panel"><ServiceAreas embedded/></div>} />
<Route path="settings" element={<Settings />} />
<Route path="search" element={<Search />} />
<Route path="*" element={<p>Page unavailable. <Link to="/admin">Open overview</Link>
</p>} />
   </Routes>
</div>
</WorkspaceContext.Provider>}
   {data && <footer className="admin-data-footer">USD base currency · Last loaded {new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Baghdad',
          dateStyle: 'medium',
          timeStyle: 'short'
        }).format(new Date(data.loadedAt))} · Baghdad time</footer>}
  </div>
 </div>;
}
