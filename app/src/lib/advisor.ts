import type {Balance, CashEntry, Reminder} from './reporting'
import {baghdadDay, currentReport} from './reporting'
import {sumUsd, usdCents} from './money'
export type AdvisorInvoice = Balance & {created_at:string}
export type AdvisorSource = {
 invoices:AdvisorInvoice[]; cash:CashEntry[]; reminders:Reminder[];
 orders:{id:string;currency:string}[];
 lines:{id:string;order_id:string;line_total:string|number;currency:string}[];
}
export type AdvisorCandidate = {id:string;invoiceId:string;invoiceLabel:string;outstanding:string;dueDate:string|null;scheduledAt:string|null;kind:'overdue'|'reminder_due'|'upcoming';balanceRank:number}
export type AdvisorSnapshot = {asOf:string;outstanding:string;overdue:string;unknownAging:string;candidates:AdvisorCandidate[];candidateCount:number;warnings:string[]}
const unique=(values:string[])=>new Set(values).size===values.length
const validDate=(value:string)=>Number.isFinite(Date.parse(value))
const dateOnly=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&validDate(value)&&new Date(value).toISOString().slice(0,10)===value
/** All money is deterministic; the model never calculates amounts or invents destinations. */
export function advisorSnapshot(source:AdvisorSource,at:Date):AdvisorSnapshot {
 const {invoices,cash,reminders,orders,lines}=source
 if(!Number.isFinite(at.getTime()))throw Error('Invalid snapshot clock.')
 if(!unique(orders.map(r=>r.id))||!unique(lines.map(r=>r.id))||!unique(reminders.map(r=>r.order_id)))throw Error('Duplicate source records. Reconcile before advice.')
 const ids=new Set(invoices.map(r=>r.id)),orderIds=new Set(orders.map(r=>r.id))
 if(ids.size!==orderIds.size||orders.some(r=>!ids.has(r.id)||r.currency!=='USD')||lines.some(r=>!ids.has(r.order_id)||r.currency!=='USD'))throw Error('Some orders lack reportable USD invoice evidence. Advice withheld.')
 if(cash.some(p=>!p.order_id||!ids.has(p.order_id)))throw Error('Unallocated cash entries need reconciliation before advice.')
 if(reminders.some(r=>!ids.has(r.order_id)||r.scheduled_at!==null&&!validDate(r.scheduled_at)))throw Error('Invalid reminder evidence. Advice withheld.')
 for(const i of invoices){
  if(!orderIds.has(i.id)||!Number.isSafeInteger(i.invoice_no)||!validDate(i.created_at)||Date.parse(i.created_at)>at.getTime()+300000||i.due_date!==null&&!dateOnly(i.due_date))throw Error('Invalid invoice evidence. Advice withheld.')
  const rows=lines.filter(l=>l.order_id===i.id)
  if(!rows.length||usdCents(sumUsd(rows.map(l=>l.line_total)))!==usdCents(i.total))throw Error('Invoice lines do not reconcile. Advice withheld.')
  const total=usdCents(i.total),collected=usdCents(i.collected),difference=total-collected
  if(total<0n||usdCents(i.outstanding)!==(difference>0n?difference:0n)||usdCents(i.overpayment)!==(difference<0n?-difference:0n))throw Error('Invalid invoice balances. Advice withheld.')
 }
 const report=currentReport(invoices,cash,reminders,at)
 if(usdCents(report.discrepancy)!==0n)throw Error('Payments do not reconcile to invoices. Advice withheld.')
 const today=baghdadDay(at),horizon=new Date(Date.parse(today+'T12:00:00Z')+7*86400000).toISOString().slice(0,10)
 const ranked=invoices.filter(i=>usdCents(i.outstanding)>0n).sort((a,b)=>usdCents(a.outstanding)===usdCents(b.outstanding)?a.id.localeCompare(b.id):usdCents(a.outstanding)>usdCents(b.outstanding)?-1:1)
 const candidates=ranked.flatMap((i,index):AdvisorCandidate[]=>{
  const reminder=reminders.find(r=>r.order_id===i.id&&r.status==='pending')
  const due=!!reminder?.scheduled_at&&Date.parse(reminder.scheduled_at)<=at.getTime()
  const kind=i.due_date&&i.due_date<today?'overdue':due?'reminder_due':i.due_date&&i.due_date<=horizon?'upcoming':null
  return kind?[{id:'C'+(index+1),invoiceId:i.id,invoiceLabel:'INV-'+String(i.invoice_no).padStart(4,'0'),outstanding:sumUsd([i.outstanding]),dueDate:i.due_date,scheduledAt:reminder?.scheduled_at??null,kind,balanceRank:index+1}]:[]
 }).sort((a,b)=>['overdue','reminder_due','upcoming'].indexOf(a.kind)-['overdue','reminder_due','upcoming'].indexOf(b.kind)||a.balanceRank-b.balanceRank)
 return {asOf:at.toISOString(),outstanding:report.outstanding,overdue:report.overdue,unknownAging:report.unknownAging,candidateCount:candidates.length,candidates:candidates.slice(0,30),warnings:[
 'Uploaded records only. Offline phone drafts are excluded until they sync.',
 'Read-only table fetches are reconciled but are not one atomic database snapshot. Open the invoice to confirm before acting.',
 ...(usdCents(report.unknownAging)>0n?['Some outstanding balances have no due date; they are excluded unless a pending reminder is due.']:[]),
 ...(candidates.length>30?['AI reviews the first 30 candidates ordered by urgency, then outstanding balance.']:[])]}
}
/** No amounts, dates, names, IDs, contacts, notes or catalogue data leave the app. */
export function advisorSignals(snapshot:AdvisorSnapshot){return snapshot.candidates.map(c=>({id:c.id,kind:c.kind,balanceRank:c.balanceRank}))}
export function validateAdvisorChoice(value:unknown,snapshot:AdvisorSnapshot):string[]{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>k!=='selected'))throw Error('Unsupported AI answer. Nothing was applied.')
 const selected=(value as {selected?:unknown}).selected
 if(!Array.isArray(selected)||selected.length>3||selected.length!==Math.min(3,snapshot.candidates.length)||selected.some(id=>typeof id!=='string'||!snapshot.candidates.some(c=>c.id===id))||!unique(selected))throw Error('Unsupported AI sources. Nothing was applied.')
 return selected
}
export const advisorReason={overdue:'Review this overdue invoice and confirm the outstanding balance before a collection follow-up.',reminder_due:'A pending collection reminder is due. Review the invoice before contacting the client.',upcoming:'Payment is due within seven days. Review it when planning upcoming collections.'}
