import { sumUsd, usdCents } from './money'

export type ProductSnapshot = { flavour?: string; name?: string; brand?: string; product_line?: string; mode?: string; sku?: string }
export function invoiceItem(snapshot: ProductSnapshot | null) {
  const name = snapshot?.flavour?.trim() || snapshot?.name?.trim()
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const line = snapshot?.product_line?.trim() || ''
  const mode = snapshot?.mode?.trim() || line.match(/(?:^|[\s_-])(MTL|DTL)(?:$|[\s_-])/i)?.[1]?.toUpperCase() || line || '—'
  return { name: name && !uuid.test(name) ? name : 'Item details unavailable', brand: snapshot?.brand?.trim() || '—', mode }
}
export type ClientBalance = {id:string;invoice_no:number;outlet_id:string;due_date:string|null;outstanding:string|number}
export function clientDebt(invoices: ClientBalance[], outletId:string, today:string) {
  if(new Set(invoices.map(row=>row.id)).size !== invoices.length)throw Error('Duplicate invoice rows. Refresh before relying on these balances.')
  const open=invoices.filter(row=>row.outlet_id===outletId && usdCents(row.outstanding)>0n)
  const overdue=open.filter(row=>row.due_date && row.due_date<today).sort((a,b)=>a.due_date!.localeCompare(b.due_date!))
  return {outstanding:sumUsd(open.map(row=>row.outstanding)),overdue:sumUsd(overdue.map(row=>row.outstanding)),invoices:overdue,unknown:open.filter(row=>!row.due_date).length}
}
