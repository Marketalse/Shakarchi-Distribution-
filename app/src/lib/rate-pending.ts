import type {LocalDb} from './db'
import type {Operation} from './solo-api'
import {scaledAmount} from './money'
const rpc='publish_solo_fx_rate'
const rateValidationError='Enter a positive IQD-per-USD rate, source and future expiry'
export type RatePendingState='pending'|'rejected'|'acknowledged'
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b)

/** Only a definitive rate-validation rejection permits correction, never a lost response. */
export async function inspectPendingRate(db:LocalDb,owner:string,command:Operation<unknown>):Promise<RatePendingState>{
 const ack=await db.local_meta.get('command-result:'+command.id)
 if(ack){
  const value=JSON.parse(ack.value)
  if(value.owner_id===owner&&value.rpc===rpc&&equal(value.request,command.request))return 'acknowledged'
  throw Error('Saved submission belongs to different details. It has been retained.')
 }
 const row=await db.commands.get(command.id)
 if(row&&(row.owner_id!==owner||row.rpc!==rpc||!equal(row.request,command.request)))throw Error('Saved submission belongs to different details. It has been retained.')
 return row?.rejected&&row.last_error===rateValidationError?'rejected':'pending'
}

/** Preserve the rejected request as local evidence; no remote write or rate removal. */
export async function archiveRejectedRate(db:LocalDb,owner:string,command:Operation<unknown>){
 await db.transaction('rw',[db.commands,db.local_meta],async()=>{
  if(await inspectPendingRate(db,owner,command)!=='rejected')throw Error('Retry the original submission to confirm its result before editing.')
  const row=await db.commands.get(command.id)
  await db.local_meta.put({key:'rejected-rate:'+owner+':'+command.id,value:JSON.stringify({command:row,archived_at:new Date().toISOString()})})
  await db.commands.delete(command.id)
 })
}

/** Validate before freezing an operation; datetime-local here is explicitly Baghdad time. */
export function manualRateRequest(rate:string,localExpiry:string,now=Date.now()){
 if(scaledAmount(rate,8)<=0n)throw Error('Enter an IQD-per-USD rate above zero.')
 const match=/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2}))?$/.exec(localExpiry)
 if(!match)throw Error('Choose a future Baghdad expiry time.')
 const date=new Date(match[1]+':'+(match[2]??'00')+'+03:00')
 if(!Number.isFinite(date.getTime())||date.getTime()<=now)throw Error('Choose an expiry later than now in Baghdad time.')
 // Reject normalized impossible calendar dates rather than silently rolling into another month.
 if(new Date(date.getTime()+3*3600000).toISOString().slice(0,19)!==match[1]+':'+(match[2]??'00'))throw Error('Choose a valid Baghdad expiry time.')
 return {exchange_rate_used:rate,rate_source:'Manual admin entry',valid_until:date.toISOString()}
}

/** An acknowledgment in one tab must not remove a newer tab's pending pointer. */
export function clearMatchingRatePointer(storage:Pick<Storage,'getItem'|'removeItem'>,id:string){
 try{
  const value=JSON.parse(storage.getItem('wsd-owner-pending-operation')??'null')
  if(value?.command?.id===id)storage.removeItem('wsd-owner-pending-operation')
 }catch{/* Preserve unreadable storage for review. */}
}
