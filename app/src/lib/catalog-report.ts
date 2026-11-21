import { sumUsd } from './money'
export type SalesLine = {id:string;order_id:string;line_total:string|number;product_snapshot:{brand?:string;product_line?:string;flavour?:string}|null}
/** Frozen descriptions only: today's registry must never regroup or reprice an old invoice. */
export function catalogSales(lines: SalesLine[], invoiceIds: Set<string>, expected: string) {
 if(new Set(lines.map(l=>l.id)).size!==lines.length)throw Error('Duplicate invoice lines; report needs reconciliation.')
 const groups=new Map<string,{brand:string;line:string;variant:string;values:(string|number)[]}>()
 for(const row of lines){
  if(!invoiceIds.has(row.order_id))continue
  const brand=row.product_snapshot?.brand?.trim() || 'Historical / unassigned brand'
  const line=row.product_snapshot?.product_line?.trim() || 'Historical / unassigned line'
  const variant=row.product_snapshot?.flavour?.trim() || 'Historical item'
  const key=JSON.stringify([brand,line,variant]);const bucket=groups.get(key)??{brand,line,variant,values:[]};bucket.values.push(row.line_total);groups.set(key,bucket)
 }
 const rows=[...groups.values()].map(g=>({...g,total:sumUsd(g.values)})).sort((a,b)=>a.brand.localeCompare(b.brand)||a.line.localeCompare(b.line)||a.variant.localeCompare(b.variant))
 if(sumUsd(rows.map(r=>r.total))!==expected)throw Error('Invoice line totals do not reconcile to issued sales. Grouping withheld.')
 return rows
}
