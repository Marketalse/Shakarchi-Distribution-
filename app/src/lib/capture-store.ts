import type { LocalDb } from './db'
import type { SurveyBrand } from './types'

export type Question = { id: string; label: string; type: string; required: boolean; options?: string[] }
export type SurveyVersion = { id: string; title: string; questions: Question[] }
export type CaptureReference = { owner_id: string; versions: SurveyVersion[]; brands: SurveyBrand[]; cached_at: string }
export type CaptureSession = {
  id: string; owner_id: string; outlet_id: string; opened_at: string
  start_protocol?: 2; server_visit_id?: string; finish_requested?: boolean; finished_at?: string; finish_operation_id: string
}
export type CaptureDraft = {
  id: string; owner_id: string; session_id: string; outlet_id: string; version_id: string; brand_id: string
  raw_answers: Record<string,string>; answers?: Record<string,string|number|boolean>
  status: 'editing'|'queued'|'synced'|'rejected'|'superseded'|'cancelled'
  created_at: string; updated_at: string; final_request?: Record<string,unknown>; last_error?: string; supersedes?: string
}
export type CaptureRemote = {
  openVisit(id: string, outlet: string): Promise<string>
  submit(id: string, request: Record<string,unknown>): Promise<unknown>
  finish(id: string, visit: string): Promise<unknown>
}
export const rejectedCode = (code?: string) => Boolean(code && /^(P000[12]|22|23|42501)/.test(code))

export async function assertWorkspaceOwner(db: LocalDb, ownerId: string) {
  const binding = await db.local_meta.get('workspace-owner')
  if (!binding || binding.value !== ownerId) throw Error('Open and verify this owner workspace online first.')
}
export async function bindWorkspaceOwner(db: LocalDb, ownerId: string) {
  await db.transaction('rw',[db.local_meta,db.outlets,db.visits,db.commands,db.outbox,db.orders,db.payments],async () => {
    const binding = await db.local_meta.get('workspace-owner')
    if (binding && binding.value !== ownerId) throw Error('This device holds another owner’s workspace. Its records have been retained.')
    if(!binding){
      const records=[...(await db.outlets.toArray()),...(await db.visits.toArray()),...(await db.commands.toArray()),...(await db.orders.toArray()),...(await db.payments.toArray()),...(await db.outbox.toArray()).map(row=>row.payload)] as Record<string,unknown>[]
      const keys=['assigned_rep','rep_id','owner_id','collected_by','created_by']
      if(records.some(row=>keys.some(key=>typeof row[key]==='string' && row[key]!==ownerId)))throw Error('Saved records belong to another account. They have been retained; this workspace cannot be opened by this user.')
    }
    await db.local_meta.put({key:'workspace-owner',value:ownerId})
  })
}
export async function openCaptureSession(db: LocalDb, ownerId: string, outletId: string) {
  await assertWorkspaceOwner(db,ownerId)
  return db.transaction('rw',db.capture_sessions,async () => {
    const found = (await db.capture_sessions.where('[owner_id+outlet_id]').equals([ownerId,outletId]).toArray())
      .find(row => !row.finished_at)
    if (found) return found
    const row: CaptureSession = {start_protocol:2,id:crypto.randomUUID(),owner_id:ownerId,outlet_id:outletId,opened_at:new Date().toISOString(),finish_operation_id:crypto.randomUUID()}
    await db.capture_sessions.add(row)
    return row
  })
}
export function newSurveyDraft(session: CaptureSession): CaptureDraft {
  const at = new Date().toISOString()
  return {id:crypto.randomUUID(),owner_id:session.owner_id,session_id:session.id,outlet_id:session.outlet_id,
    version_id:'',brand_id:'',raw_answers:{},status:'editing',created_at:at,updated_at:at}
}
export async function saveSurveyDraft(db: LocalDb, draft: CaptureDraft) {
  await assertWorkspaceOwner(db,draft.owner_id)
  await db.transaction('rw',db.capture_drafts,async () => {
    const old = await db.capture_drafts.get(draft.id)
    if (old && (old.owner_id !== draft.owner_id || old.session_id !== draft.session_id || old.status !== 'editing')) throw Error('A submitted draft cannot be changed. Review its saved status first.')
    const edits=await db.capture_drafts.where('session_id').equals(draft.session_id).filter(d=>d.status==='editing' && d.id!==draft.id).toArray()
    for(const edit of edits){
      if(edit.version_id || edit.brand_id || Object.values(edit.raw_answers).some(Boolean))throw Error('Another unfinished draft exists. Reopen it before starting another.')
      await db.capture_drafts.update(edit.id,{status:'cancelled'})
    }
    await db.capture_drafts.put({...draft,updated_at:new Date().toISOString()})
  })
}
export async function queueSurveyDraft(db: LocalDb, draft: CaptureDraft, answers: NonNullable<CaptureDraft['answers']>) {
  await assertWorkspaceOwner(db,draft.owner_id)
  await db.transaction('rw',[db.capture_drafts,db.capture_sessions],async () => {
    const session = await db.capture_sessions.get(draft.session_id)
    if (!session || session.owner_id !== draft.owner_id || session.finish_requested || session.finished_at) throw Error('Start a new survey visit before submitting.')
    const old = await db.capture_drafts.get(draft.id)
    if (old && (old.status !== 'editing' || old.owner_id!==draft.owner_id || old.session_id!==draft.session_id)) throw Error('This draft has already been submitted or belongs to another visit.')
    if (draft.supersedes) {
      const prior=await db.capture_drafts.get(draft.supersedes)
      if (!prior || prior.owner_id!==draft.owner_id || prior.status!=='rejected') throw Error('Only a rejected submission can be replaced.')
      await db.capture_drafts.update(prior.id,{status:'superseded'})
    }
    await db.capture_drafts.put({...draft,answers,status:'queued',updated_at:new Date().toISOString()})
  })
}
export async function requestCaptureFinish(db: LocalDb, ownerId: string, sessionId: string) {
  await assertWorkspaceOwner(db,ownerId)
  await db.transaction('rw',[db.capture_sessions,db.capture_drafts],async () => {
    const session=await db.capture_sessions.get(sessionId)
    if (!session || session.owner_id!==ownerId) throw Error('Visit unavailable.')
    const drafts=await db.capture_drafts.where('session_id').equals(sessionId).toArray()
    if (drafts.some(d=>d.status==='rejected' || (d.status==='editing' && (d.version_id || d.brand_id || Object.values(d.raw_answers).some(Boolean))))) throw Error('Submit or review saved drafts before finishing.')
    await db.capture_sessions.update(sessionId,{finish_requested:true})
  })
}
/** Each session resolves once; each submitted request freezes before its first network attempt. */
export async function flushCapture(db: LocalDb, ownerId: string, remote: CaptureRemote) {
  await assertWorkspaceOwner(db,ownerId)
  const sessions=await db.capture_sessions.where('owner_id').equals(ownerId).sortBy('opened_at')
  for (const original of sessions) {
    if (original.finished_at) continue
    let session=(await db.capture_sessions.get(original.id))!
    if (!session.server_visit_id) {
      if (session.start_protocol !== 2) throw Error('An older visit start needs review before syncing. Its client and survey records are retained; no new visit was assigned.')
      const serverId=await remote.openVisit(session.id,session.outlet_id)
      await db.capture_sessions.update(session.id,{server_visit_id:serverId})
      session={...session,server_visit_id:serverId}
    }
    const drafts=await db.capture_drafts.where('session_id').equals(session.id).sortBy('created_at')
    for (const draft of drafts) {
      if (draft.owner_id!==ownerId || draft.status!=='queued') continue
      const request=draft.final_request ?? {version_id:draft.version_id,outlet_id:draft.outlet_id,visit_id:session.server_visit_id,brand_id:draft.brand_id,answers:draft.answers}
      if (!draft.final_request) await db.capture_drafts.update(draft.id,{final_request:request})
      try {
        await remote.submit(draft.id,request)
        await db.capture_drafts.update(draft.id,{status:'synced',last_error:undefined,updated_at:new Date().toISOString()})
      } catch(failure) {
        await db.capture_drafts.update(draft.id,{status:rejectedCode((failure as {code?:string}).code)?'rejected':'queued',last_error:failure instanceof Error?failure.message:String(failure)})
        throw failure
      }
    }
    const currentDrafts=await db.capture_drafts.where('session_id').equals(session.id).toArray()
    if (session.finish_requested && !currentDrafts.some(d=>['queued','rejected'].includes(d.status))) {
      await remote.finish(session.finish_operation_id,session.server_visit_id!)
      await db.capture_sessions.update(session.id,{finished_at:new Date().toISOString()})
    }
  }
}
