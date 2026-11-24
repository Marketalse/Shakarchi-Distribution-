import type {SupabaseClient} from '@supabase/supabase-js'
import type {LocalDb} from './db'
import {offlineOwner,cachedFieldRead} from './offline'
import {clientDebt,type ClientBalance} from './invoice-display'
import {usdCents} from './money'
import {baghdadDay} from './reporting'
import type {RecordedVisit} from './operational-report'

export type VisitInvoice=ClientBalance&{created_at:string;total:string|number}
export type VisitSource<T>={rows:T[];at:string}
export function visitPayments(rows:VisitInvoice[],outletId:string,at:Date){
 const debt=clientDebt(rows,outletId,baghdadDay(at))
 const pending=rows.filter(r=>r.outlet_id===outletId&&usdCents(r.outstanding)>0n).sort((a,b)=>(a.due_date??'9999').localeCompare(b.due_date??'9999')||a.invoice_no-b.invoice_no)
 return {...debt,pending}
}
export function lastCompletedVisit(rows:RecordedVisit[],outletId:string){
 const visits=rows.filter(r=>r.outlet_id===outletId)
 if(new Set(visits.map(v=>v.id)).size!==visits.length)throw Error('Duplicate visit records. Sync and review history.')
 for(const v of visits){if(!Number.isFinite(Date.parse(v.checked_in_at))||(v.checked_out_at&&(!Number.isFinite(Date.parse(v.checked_out_at))||Date.parse(v.checked_out_at)<Date.parse(v.checked_in_at))))throw Error('Visit dates need review.')}
 return visits.filter(v=>v.checked_out_at).sort((a,b)=>Date.parse(b.checked_out_at!)-Date.parse(a.checked_out_at!))[0]
}
/** Reads owner-bound confirmed snapshots. No visit, draft or posting writes. */
export async function visitRows<T extends {outlet_id:string}>(db:LocalDb,client:SupabaseClient|null,owner:string,outletId:string,table:string,columns:string):Promise<VisitSource<T>>{
 if(await offlineOwner(db)!==owner)throw Error('Workspace owner mismatch. Saved work is retained.')
 const saved=await db.local_meta.get(`field-table:${owner}:${table}`)
 if(saved){const snapshot=JSON.parse(saved.value);return {rows:(snapshot.rows as T[]).filter(r=>r.outlet_id===outletId),at:snapshot.at}}
 return cachedFieldRead(db,`visit-context:${table}:${outletId}`,async()=>{
  if(!client)throw Error('Sync once to load this customer context.')
  const rows:T[]=[]
  for(let offset=0;;offset+=500){const {data,error}=await client.from(table).select(columns).eq('outlet_id',outletId).order('id').range(offset,offset+499);if(error)throw Error(error.message);rows.push(...data as unknown as T[]);if(data.length<500)break}
  return {rows,at:new Date().toISOString()}
 })
}
export async function localVisitWork(db:LocalDb,owner:string,outletId:string){
 if(await offlineOwner(db)!==owner)throw Error('Workspace owner mismatch. Saved work is retained.')
 const [sessions,drafts,order,pending,reference]=await Promise.all([
  db.capture_sessions.where('[owner_id+outlet_id]').equals([owner,outletId]).toArray(),
  db.capture_drafts.where('owner_id').equals(owner).filter(d=>d.outlet_id===outletId&&!['synced','cancelled','superseded'].includes(d.status)).toArray(),
  db.local_meta.get(`order-draft:${owner}:${outletId}`),db.local_meta.get(`order-pending:${owner}:${outletId}`),db.capture_reference.get(owner),
 ])
 const hasOrder=Boolean(order&&Object.values(JSON.parse(order.value).lines??{}).some(q=>Number(q)>0))
 return {session:sessions.find(s=>!s.finished_at),drafts,hasOrder,pendingOrder:Boolean(pending),forms:reference?.versions.length}
}
