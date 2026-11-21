import type { LocalDb } from './db'

export type PendingCommand = {
  id: string; owner_id: string; rpc: string; request: unknown
  queued_at: string; attempts: number; last_error?: string; posted_request?: unknown; rejected?: boolean
}
export type CommandRemote = (rpc: string, id: string, request: unknown) => Promise<unknown>
const supported = new Set(['issue_solo_invoice_v2','update_solo_product_v2','import_solo_data_v2','issue_solo_invoice', 'post_solo_collection', 'reschedule_solo_reminder',
  'set_solo_service_area', 'publish_solo_survey', 'submit_solo_survey', 'publish_solo_fx_rate', 'update_solo_product', 'import_solo_data', 'finish_solo_visit', 'correct_solo_client_location', 'update_solo_client', 'submit_solo_observation'])

export async function sendCommand(db: LocalDb, ownerId: string, rpc: string, id: string, request: unknown, remote: CommandRemote) {
  if (!supported.has(rpc)) throw Error('Unsupported operation; retained for review.')
  const command = await db.transaction('rw', [db.commands,db.local_meta], async () => {
    const acknowledged=await db.local_meta.get('command-result:'+id)
    if(acknowledged){const ack=JSON.parse(acknowledged.value);if(ack.owner_id!==ownerId || ack.rpc!==rpc || JSON.stringify(ack.request)!==JSON.stringify(request))throw Error('Operation identity already belongs to different details.');return {acknowledged:ack.result} as const}
    const previous = await db.commands.get(id)
    if (previous && (previous.owner_id !== ownerId || previous.rpc !== rpc || JSON.stringify(previous.request) !== JSON.stringify(request))) throw Error('Operation identity already belongs to different details.')
    const frozen = previous ?? { id, owner_id: ownerId, rpc, request: structuredClone(request), queued_at: new Date().toISOString(), attempts: 0 }
    await db.commands.put(frozen)
    return frozen
  })
  if ('acknowledged' in command) return command.acknowledged
  try {
    let posted=command.posted_request
    if(posted===undefined){
      posted=structuredClone(command.request)
      const payload=posted as {visit_id?:string}
      const visit=payload?.visit_id ? await db.capture_sessions.get(payload.visit_id) : undefined
      if(visit){if(visit.owner_id!==ownerId)throw Error('Visit belongs to another workspace.');if(!visit.server_visit_id)throw Error('Saved visit is waiting to sync.');payload.visit_id=visit.server_visit_id}
      // Freeze the resolved transport request once, before any network attempt.
      posted=await db.transaction('rw',db.commands,async()=>{const current=await db.commands.get(command.id);if(current?.posted_request!==undefined)return current.posted_request;await db.commands.update(command.id,{posted_request:posted});return posted})
    }
    const result = await remote(rpc, command.id, posted)
    await db.transaction('rw',[db.commands,db.local_meta,db.attachments],async()=>{
      await db.local_meta.put({key:'command-result:'+command.id,value:JSON.stringify({owner_id:ownerId,rpc,request:command.request,result})})
      await db.commands.delete(command.id)
      await db.attachments.delete(command.id)
    })
    return result
  } catch (failure) {
    await db.commands.update(command.id, { attempts: command.attempts + 1, last_error: failure instanceof Error ? failure.message : String(failure), rejected: /^(P000[12]|22|23|42501|55000)/.test((failure as {code?:string}).code??'') })
    throw failure
  }
}

export async function flushCommands(db: LocalDb, ownerId: string, remote: CommandRemote, include:(item:PendingCommand)=>boolean=()=>true) {
  const commands = await db.commands.where('owner_id').equals(ownerId).sortBy('queued_at')
  const errors:string[]=[]
  for (const item of commands) {if(!include(item))continue;if(item.rejected){errors.push(item.last_error??'Saved operation needs review.');continue}try{await sendCommand(db, ownerId, item.rpc, item.id, item.request, remote)}catch(e){errors.push(e instanceof Error?e.message:String(e))}}
  if(errors.length)throw Error(errors.join(' · '))
}
