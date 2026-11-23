import type { AdminData } from './admin-data'
import { currentReport, baghdadDay } from './reporting'
import { usdCents } from './money'
import { operationalReport, reportingWindow, inReportingWindow, type ReportingPeriod } from './operational-report'

export const managerNavigation = [
  { label: 'Workspace', items: [['', 'Manager Home', 'home'], ['activity', 'Field Activity', 'pin'], ['clients', 'Customers', 'shop']] },
  { label: 'Sales & finance', items: [['orders', 'Orders & Invoices', 'cart'], ['collections', 'Collections', 'wallet']] },
  { label: 'Build', items: [['catalog', 'Product Catalog', 'box'], ['surveys', 'Surveys & Responses', 'file'], ['imports', 'Imports', 'upload'], ['areas', 'Service Areas', 'pin']] },
  { label: 'Intelligence', items: [['reports', 'Reports', 'chart'], ['advisor', 'AI Advisor', 'spark']] },
  { label: 'Administration', items: [['settings', 'Settings', 'settings']] },
]
export type ActivityItem = { key: string; kind: string; at: string; outletId: string; href: string; label?: string }
export function managerActivity(data: AdminData, period: ReportingPeriod, at: Date): ActivityItem[] {
  operationalReport(data, period, at) // Validate confirmed identities, timestamps and client joins.
  const range = reportingWindow(period, at)
  const rows: ActivityItem[] = [
    ...(data.visits ?? []).flatMap(v => [{key:'start:'+v.id,kind:'Visit started',at:v.checked_in_at,outletId:v.outlet_id,href:'/admin/clients/'+v.outlet_id}, ...(v.checked_out_at ? [{key:'finish:'+v.id,kind:'Visit completed',at:v.checked_out_at,outletId:v.outlet_id,href:'/admin/clients/'+v.outlet_id}] : [])]),
    ...data.runs.map(r => ({key:'form:'+r.id,kind:'Survey received',at:r.created_at,outletId:r.outlet_id,href:'/admin/surveys/observations'})),
    ...data.observations.map(r => ({key:'observation:'+r.id,kind:'Market observation',at:r.created_at,outletId:r.outlet_id,href:'/admin/surveys/observations'})),
    ...data.invoices.map(i => ({key:'invoice:'+i.id,kind:'Invoice issued',at:i.created_at,outletId:i.outlet_id,href:'/admin/orders?invoice='+i.id,label:'INV-'+String(i.invoice_no).padStart(4,'0')})),
  ]
  return rows.filter(r => inReportingWindow(r.at, range)).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)||a.key.localeCompare(b.key))
}
export function managerFocus(data: AdminData, at: Date) {
  const report = currentReport(data.invoices, data.cash, data.reminders, at)
  operationalReport(data, 'all', at)
  const dueIds = new Set(report.due.map(r => r.invoice.id))
  const payments = data.invoices.filter(i => usdCents(i.outstanding)>0n && (dueIds.has(i.id) || Boolean(i.due_date && i.due_date<baghdadDay(at))))
    .sort((a,b)=>(a.due_date??'9999').localeCompare(b.due_date??'9999') || a.invoice_no-b.invoice_no)
  const openVisits = (data.visits??[]).filter(v=>!v.checked_out_at && Date.parse(v.checked_in_at)<=at.getTime()).sort((a,b)=>a.checked_in_at.localeCompare(b.checked_in_at))
  return { report, payments, openVisits }
}
