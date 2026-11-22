import {usdAmount, usdCents} from './money'
import {baghdadDay, type Balance} from './reporting'
import {inReportingWindow, reportingWindow, type ReportingPeriod} from './operational-report'
import type {SalesLine} from './catalog-report'

const bucketNames = ['Not due', '1–30 days overdue', '31–60 days overdue', '61–90 days overdue', 'Over 90 days overdue', 'Unknown due date'] as const
function dayNumber(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Error('Invalid invoice due date. Review source records.')
  const result = Date.parse(value + 'T00:00:00Z')
  if (!Number.isFinite(result) || new Date(result).toISOString().slice(0,10) !== value) throw Error('Invalid invoice due date. Review source records.')
  return result / 86400000
}
/** Current receivables only. Overpayments never cancel another invoice's debt. */
export function receivablesAging(invoices: Balance[], at: Date) {
  if (new Set(invoices.map(i=>i.id)).size!==invoices.length) throw Error('Duplicate invoices. Refresh before using aging.')
  const today=baghdadDay(at), now=dayNumber(today)
  const buckets=bucketNames.map(label=>({label, count:0, amount:0n}))
  const rows=invoices.flatMap(invoice=>{
    const amount=usdCents(invoice.outstanding)
    if(amount<0n) throw Error('Negative outstanding balance. Review invoice reconciliation.')
    if(amount===0n)return []
    const days=invoice.due_date===null?null:now-dayNumber(invoice.due_date)
    const index=days===null?5:days<=0?0:days<=30?1:days<=60?2:days<=90?3:4
    buckets[index].count++;buckets[index].amount+=amount
    return [{invoice,bucket:bucketNames[index],daysOverdue:days===null?null:Math.max(0,days)}]
  })
  return {today,rows,buckets:buckets.map(b=>({...b,amount:usdAmount(b.amount)})),total:usdAmount(buckets.reduce((n,b)=>n+b.amount,0n))}
}

export type ProfitLine = Omit<SalesLine, 'product_snapshot'> & {
  product_snapshot: (NonNullable<SalesLine['product_snapshot']> & {currency?:string}) | null;
  product_id?: string; quantity?: number; kind?: string;
  unit_price?: string|number; unit_cost?: string|number|null;
}
type ProfitInvoice = Balance & {created_at:string}
function percentage(profit:bigint,sales:bigint) {
  if(sales<=0n)return null
  const sign=profit<0n?'-':'',absolute=profit<0n?-profit:profit
  const hundredths=(absolute*10000n+sales/2n)/sales
  return sign+hundredths/100n+'.'+String(hundredths%100n).padStart(2,'0')
}
type Accumulator={sales:bigint;cost:bigint;lines:number;missing:number;returns:number}
const empty=():Accumulator=>({sales:0n,cost:0n,lines:0,missing:0,returns:0})
function finish(a:Accumulator) {
  const complete=a.lines>0&&a.missing===0&&a.returns===0, profit=a.sales-a.cost
  return {sales:usdAmount(a.sales),lines:a.lines,missing:a.missing,returns:a.returns,complete,
    cost:complete?usdAmount(a.cost):null,profit:complete?usdAmount(profit):null,margin:complete?percentage(profit,a.sales):null}
}
/** Issued-invoice cohort and frozen line costs; refunds alone never alter revenue or COGS. */
export function invoiceGrossProfit(invoices:ProfitInvoice[],lines:ProfitLine[]|undefined,period:ReportingPeriod,at:Date) {
  if(!lines)throw Error('Invoice cost data unavailable. Refresh before using gross profit.')
  if(new Set(invoices.map(i=>i.id)).size!==invoices.length||new Set(lines.map(l=>l.id)).size!==lines.length)throw Error('Duplicate financial records. Gross profit withheld.')
  const range=reportingWindow(period,at),selected=invoices.filter(i=>inReportingWindow(i.created_at,range))
  const byId=new Map(selected.map(i=>[i.id,i])),perInvoice=new Map(selected.map(i=>[i.id,{sum:0n,count:0}]))
  const total=empty(),groups=new Map<string,{label:string;brand:string;line:string;value:Accumulator}>(),clients=new Map<string,Accumulator>()
  for(const row of lines){
    const invoice=byId.get(row.order_id);if(!invoice)continue
    const sales=usdCents(row.line_total),reconciliation=perInvoice.get(invoice.id)!
    reconciliation.sum+=sales;reconciliation.count++
    let cost:bigint|null=null,returned=false
    if(row.kind==='sale'||row.kind==='return'){
      if(!Number.isSafeInteger(row.quantity)||row.quantity! <= 0)throw Error('Invalid invoice quantity. Gross profit withheld.')
      if(row.unit_price===undefined||usdCents(row.unit_price)<0n)throw Error('Invalid historical invoice price. Gross profit withheld.')
      const expected=usdCents(row.unit_price)*BigInt(row.quantity!)*(row.kind==='return'?-1n:1n)
      if(expected!==sales)throw Error('Invoice quantity and price do not reconcile. Gross profit withheld.')
      // Legacy return rows do not prove verified inventory/cost reversal.
      returned=row.kind==='return'
      if(!returned&&row.product_snapshot?.currency==='USD'&&row.unit_cost!==null&&row.unit_cost!==undefined){
        const unit=usdCents(row.unit_cost);if(unit<0n)throw Error('Invalid historical cost. Gross profit withheld.')
        cost=unit*BigInt(row.quantity!)
      }
    }
    const brand=row.product_snapshot?.brand?.trim()||'Historical / unassigned brand'
    const line=row.product_snapshot?.product_line?.trim()||'Historical / unassigned line'
    const label=row.product_snapshot?.flavour?.trim()||'Historical item'
    const key=JSON.stringify([row.product_id??null,brand,line,label])
    const group=groups.get(key)??{label,brand,line,value:empty()};groups.set(key,group)
    const client=clients.get(invoice.outlet_id)??empty();clients.set(invoice.outlet_id,client)
    for(const bucket of [total,group.value,client]){
      bucket.sales+=sales;bucket.lines++
      if(returned)bucket.returns++;else if(cost===null)bucket.missing++;else bucket.cost+=cost
    }
  }
  for(const invoice of selected){
    const check=perInvoice.get(invoice.id)!
    if(!check.count||check.sum!==usdCents(invoice.total))throw Error('Invoice lines do not reconcile per invoice. Gross profit withheld.')
  }
  return {total:finish(total),groups:[...groups.values()].map(g=>({...g,value:finish(g.value)})).sort((a,b)=>a.brand.localeCompare(b.brand)||a.line.localeCompare(b.line)||a.label.localeCompare(b.label)),clients:[...clients].map(([id,value])=>({id,...finish(value)}))}
}
