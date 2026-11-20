import { sumUsd, usdAmount, usdCents } from './money'
export type Balance = { id: string; invoice_no: number; outlet_id: string; total: string | number; collected: string | number; outstanding: string | number; overpayment: string | number; due_date: string | null; payment_status: string; recipient_snapshot?: { name?: string } | null }
export type CashEntry = { id: string; order_id: string | null; amount: string | number }
export type Reminder = { order_id: string; status: string; scheduled_at: string | null }
export const baghdadDay = (at: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
/** Current balances; all-time cash. Never join ledger rows onto invoice lines. */
export function currentReport(invoices: Balance[], cash: CashEntry[], reminders: Reminder[], at: Date) {
  if (new Set(invoices.map(i => i.id)).size !== invoices.length || new Set(cash.map(i => i.id)).size !== cash.length) throw Error('Duplicate financial rows. Reload and reconcile before reporting.')
  const today = baghdadDay(at)
  const byInvoice = new Map(invoices.map(i => [i.id, i]))
  const due = [...new Map(reminders.map(r => [r.order_id, r])).values()].flatMap(r => {
    const invoice = byInvoice.get(r.order_id)
    return r.status === 'pending' && r.scheduled_at && new Date(r.scheduled_at).getTime() <= at.getTime() && invoice && usdCents(invoice.outstanding) > 0n ? [{ ...r, invoice }] : []
  }).sort((a,b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at)))
  const overdue = invoices.filter(i => usdCents(i.outstanding) > 0n && i.due_date && i.due_date < today)
  const unknown = invoices.filter(i => usdCents(i.outstanding) > 0n && !i.due_date)
  const linkedCash = cash.filter(p => p.order_id && byInvoice.has(p.order_id))
  const cashByInvoice = new Map<string,bigint>()
  for (const p of linkedCash) cashByInvoice.set(p.order_id!, (cashByInvoice.get(p.order_id!) ?? 0n) + usdCents(p.amount))
  // Absolute per-invoice differences cannot cancel each other out.
  const discrepancy = invoices.reduce((sum,i) => {
    const difference = usdCents(i.collected) - (cashByInvoice.get(i.id) ?? 0n)
    return sum + (difference < 0n ? -difference : difference)
  },0n)
  return {
    sales: sumUsd(invoices.map(i => i.total)), netCash: sumUsd(cash.map(p => p.amount)),
    outstanding: sumUsd(invoices.map(i => i.outstanding)), overpayment: sumUsd(invoices.map(i => i.overpayment)),
    overdue: sumUsd(overdue.map(i => i.outstanding)), unknownAging: sumUsd(unknown.map(i => i.outstanding)),
    unallocatedCash: sumUsd(cash.filter(p => !p.order_id || !byInvoice.has(p.order_id)).map(p => p.amount)),
    discrepancy: usdAmount(discrepancy), due,
  }
}
