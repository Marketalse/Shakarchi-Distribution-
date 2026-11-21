import type {LocalDb} from './db'
import {flush,type Remote} from './sync'
import {flushCapture,type CaptureRemote} from './capture-store'
import {flushCommands,type CommandRemote} from './commands'
/** Resolve each stop, upload its records, then finish it before opening the next stop. */
export async function flushWorkspace(db:LocalDb,owner:string,outbox:Remote,capture:CaptureRemote,commands:CommandRemote){
 const errors:string[]=[]
 const attempt=async(work:()=>Promise<unknown>)=>{try{await work()}catch(e){errors.push(e instanceof Error?e.message:String(e))}}
 const uploaded=await flush(db,outbox,true);if(uploaded.stoppedBy)errors.push(uploaded.stoppedBy)
 const sessions=await db.capture_sessions.where('owner_id').equals(owner).sortBy('opened_at'),ids=new Set(sessions.map(s=>s.id)),blocked=new Set<string>()
 for(const session of sessions){
  if(session.finished_at)continue
  if(blocked.has(session.outlet_id))continue
  await attempt(()=>flushCapture(db,owner,capture,false,session.id))
  const current=await db.capture_sessions.get(session.id)
  if(current?.server_visit_id){
   await attempt(()=>flushCommands(db,owner,commands,c=>{const p=c.request as {visit_id?:string};return p.visit_id===session.id||p.visit_id===current.server_visit_id}))
   await attempt(()=>flushCapture(db,owner,capture,true,session.id))
  }
  if(!(await db.capture_sessions.get(session.id))?.finished_at)blocked.add(session.outlet_id)
 }
 await attempt(()=>flushCommands(db,owner,commands,c=>!ids.has((c.request as {visit_id?:string}).visit_id??'')))
 return errors
}
