import { useEffect, useState, type FormEvent } from 'react'
import type { Outlet } from '../lib/types'
import { db } from '../lib/db'
import { supabase } from '../lib/supabase'
import { soloApi } from '../lib/solo-api'
import { captureOperation, surveyAnswers } from '../lib/capture'
import { openCaptureSession, newSurveyDraft, saveSurveyDraft, queueSurveyDraft, requestCaptureFinish, type CaptureSession, type CaptureDraft, type CaptureReference } from '../lib/capture-store'
import { cacheCaptureReference } from '../lib/capture-reference'
import { useRef } from 'react'
import { useServiceAreas } from '../lib/useServiceAreas'
import { areaChoices } from '../lib/service-areas'
import { liveQuery } from 'dexie'

export function ClientEdit({ retail, onSaved }: { retail: Outlet; onSaved: () => void }) {
  const {areas}=useServiceAreas()
  const [optionalContact, setOptionalContact] = useState(Boolean(retail.staff_name || retail.staff_phone))
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false)
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || busy) return
    const values = new FormData(event.currentTarget)
    const fields = Object.fromEntries([...values.entries()].map(([key, value]) => [key, String(value).trim() || null]))
    setBusy(true); setError(''); setNotice('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw Error('Sign in before editing.')
      const command = await captureOperation(db, session.user.id, 'update_solo_client', { outlet_id: retail.id, expected_updated_at: retail.updated_at, fields })
      await soloApi(supabase).updateClient(command)
      const { data, error } = await supabase.from('outlets').select('*').eq('id', retail.id).single()
      if (error) throw error
      await db.outlets.put(data as Outlet)
      setNotice('Client updated.'); onSaved()
    } catch (failure) {
      const queued=await db.commands.toArray()
      if (queued.some(c=>c.rpc==='update_solo_client' && (c.request as {outlet_id?:string}).outlet_id===retail.id)) setNotice('Client edit saved on this device. Sync when connected.')
      else setError(failure instanceof Error ? failure.message : String(failure))
    }
    finally { setBusy(false) }
  }
  return <form className="form" onSubmit={event => void save(event)} key={retail.updated_at}>
    <h2>Client profile</h2>
    {(['retail_name', 'owner_name', 'owner_phone', 'area', 'outlet_type', 'address'] as const).map(key =>
      <label key={key}>{key.replaceAll('_', ' ')}<input name={key} defaultValue={retail[key] ?? ''} required={['retail_name', 'province', 'area', 'outlet_type'].includes(key)} /></label>)}
    <label>Service area<select name="province" defaultValue={retail.province} required>{areaChoices(areas,retail.province).map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></label>
    <button type="button" className="link optional-contact" aria-expanded={optionalContact} aria-controls="edit-staff-contact" onClick={() => setOptionalContact(value => !value)}>{optionalContact ? 'Hide optional contact' : '+ Optional contact'}</button>
    <div id="edit-staff-contact" className="form" hidden={!optionalContact}>
      <label>Staff name<input name="staff_name" defaultValue={retail.staff_name ?? ''} /></label>
      <label>Staff phone<input name="staff_phone" type="tel" defaultValue={retail.staff_phone ?? ''} /></label>
    </div>
    <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save client'}</button>
    {error && <p className="error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
  </form>
}

export function DynamicSurvey({ outletId, ownerId, onChanged, onSyncRequested }: { outletId: string; ownerId: string; onChanged: () => void; onSyncRequested: () => Promise<void> }) {
  const [reference,setReference]=useState<CaptureReference>()
  const [session,setSession]=useState<CaptureSession>()
  const [draft,setDraft]=useState<CaptureDraft>()
  const draftRef=useRef<CaptureDraft | undefined>(undefined)
  const writes=useRef(Promise.resolve())
  const [saved,setSaved]=useState<CaptureDraft[]>([])
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false)
  const busyRef=useRef(false)
  const version=reference?.versions.find(v=>v.id===draft?.version_id)

  useEffect(()=>{
    let active=true
    async function load() {
      const current=await openCaptureSession(db,ownerId,outletId)
      const records=await db.capture_drafts.where('session_id').equals(current.id).toArray()
      const edit=records.find(d=>d.status==='editing') ?? newSurveyDraft(current)
      let cache=await db.capture_reference.get(ownerId)
      if(active){setSession(current);setSaved(records);draftRef.current=edit;setDraft(edit);setReference(cache);onChanged()}
      if(navigator.onLine && supabase){
        try {cache=await cacheCaptureReference(db,ownerId,supabase);if(active)setReference(cache)}
        catch(failure){if(active && !cache)setError(String((failure as Error).message))}
      }
    }
    void load().catch(failure=>{if(active)setError(String(failure.message))})
    return()=>{active=false}
  },[ownerId,outletId])

  useEffect(()=>{
    if(!session?.id)return
    const subscription=liveQuery(async()=>({
      session:await db.capture_sessions.get(session.id),
      drafts:await db.capture_drafts.where('session_id').equals(session.id).toArray(),
      reference:await db.capture_reference.get(ownerId),
    })).subscribe({next:value=>{if(value.session)setSession(value.session);setSaved(value.drafts);if(value.reference)setReference(value.reference)},error:failure=>setError(String(failure))})
    return()=>subscription.unsubscribe()
  },[session?.id,ownerId])

  function change(fields:Partial<CaptureDraft>) {
    if(!draftRef.current || busyRef.current)return
    const next={...draftRef.current,...fields,updated_at:new Date().toISOString()}
    draftRef.current=next;setDraft(next);setNotice('Saving draft…')
    writes.current=writes.current.catch(()=>{}).then(()=>saveSurveyDraft(db,next)).then(()=>{setNotice('Draft saved on this device.')}).catch(failure=>{setError('Could not save draft: '+String(failure.message));throw failure})
    void writes.current.catch(()=>{})
  }
  async function refreshSaved() {
    if(!session)return
    setSaved(await db.capture_drafts.where('session_id').equals(session.id).toArray())
    onChanged()
  }
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if(!draftRef.current || !version || !session || busyRef.current)return
    const values=new FormData(event.currentTarget)
    busyRef.current=true;setBusy(true);setError('')
    try {
      await writes.current.catch(()=>{})
      await saveSurveyDraft(db,draftRef.current)
      if(!reference?.brands.some(b=>b.id===draftRef.current!.brand_id && !b.is_own && b.active))throw Error('Choose an approved competitor.')
      const answers=surveyAnswers(version.questions,values)
      const submittedId=draftRef.current.id
      await queueSurveyDraft(db,draftRef.current,answers)
      const next=newSurveyDraft(session);draftRef.current=next;setDraft(next);setNotice('Survey saved on this device. Waiting to sync.')
      await refreshSaved()
      if(navigator.onLine && supabase){
        await onSyncRequested()
        const submitted=await db.capture_drafts.get(submittedId)
        setNotice(submitted?.status==='synced'?'Survey synced.':'Saved on this device. Review its status below or retry Sync.')
        await refreshSaved()
      }
    }catch(failure){setError(String((failure as Error).message))}
    finally{busyRef.current=false;setBusy(false)}
  }
  async function retry() {
    if(!supabase || busyRef.current)return
    busyRef.current=true;setBusy(true);setError('')
    try{await writes.current.catch(()=>{});await onSyncRequested();await refreshSaved();setNotice('Sync checked. See each saved survey status below.')}
    catch(failure){setError(String((failure as Error).message));await refreshSaved()}
    finally{busyRef.current=false;setBusy(false)}
  }
  async function finish() {
    if(!session || busyRef.current)return
    busyRef.current=true;setBusy(true);setError('')
    try{
      await writes.current;await requestCaptureFinish(db,ownerId,session.id)
      setNotice('Visit finish saved. It will sync after its surveys.')
      setSession({...session,finish_requested:true});onChanged()
      if(navigator.onLine && supabase){await onSyncRequested();const finished=await db.capture_sessions.get(session.id);if(finished?.finished_at)setNotice('Visit finished.')}
    }catch(failure){setError(String((failure as Error).message))}
    finally{busyRef.current=false;setBusy(false)}
  }
  async function review(row:CaptureDraft) {
    if(!session || busyRef.current)return
    if(draft?.version_id || draft?.brand_id || Object.values(draft?.raw_answers ?? {}).some(Boolean)){setError('Submit your current draft before opening another.');return}
    const next={...newSurveyDraft(session),version_id:row.version_id,brand_id:row.brand_id,raw_answers:row.raw_answers,supersedes:row.id}
    try{await saveSurveyDraft(db,next);draftRef.current=next;setDraft(next);setError('');setNotice('Correct the rejected answers and submit again. The original is retained.')}
    catch(failure){setError(String((failure as Error).message))}
  }
  async function startNextVisit(){
    if(busyRef.current)return
    try{const next=await openCaptureSession(db,ownerId,outletId);const edit=newSurveyDraft(next);setSession(next);draftRef.current=edit;setDraft(edit);setNotice('New survey visit started.');onChanged()}
    catch(failure){setError(String((failure as Error).message))}
  }
  return <section>
    <h2>Survey forms</h2>
    {session?.finish_requested && <p role="status">{session.finished_at?'Visit finished.':'Visit finish is waiting to sync.'}</p>}
    {session?.finished_at && <button onClick={()=>void startNextVisit()}>Start new survey visit</button>}
    {reference && <p className="muted">Forms saved {new Intl.DateTimeFormat('en-GB',{dateStyle:'medium'}).format(new Date(reference.cached_at))}</p>}
    {!reference && <p>Connect and Sync once to save published forms for offline use. Your survey templates have not been created for you.</p>}
    {reference && !reference.versions.length && <p>No published survey yet. Your templates can be added in owner tools when ready.</p>}
    {draft && reference && !session?.finish_requested && <>
      <label>Survey type<select value={draft.version_id} disabled={busy} onChange={e=>change({version_id:e.target.value,raw_answers:{}})}><option value="">Choose published form</option>{reference.versions.map(v=><option key={v.id} value={v.id}>{v.title}</option>)}</select></label>
      {version && <form className="form" onSubmit={e=>void submit(e)} key={draft.id}>
        <fieldset disabled={busy} className="retail-fields form">
          <label>Competitor brand<select name="brand_id" required value={draft.brand_id} onChange={e=>change({brand_id:e.target.value})}><option value="">Choose competitor</option>{reference.brands.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
          {version.questions.map(q=><label key={q.id}>{q.label}{q.type==='choice'||q.type==='boolean'
            ? <select name={'answer:'+q.id} required={q.required} value={draft.raw_answers[q.id]??''} onChange={e=>change({raw_answers:{...draftRef.current!.raw_answers,[q.id]:e.target.value}})}><option value="">Choose</option>{(q.type==='boolean'?['true','false']:q.options??[]).map(v=><option key={v} value={v}>{v==='true'?'Yes':v==='false'?'No':v}</option>)}</select>
            : <input name={'answer:'+q.id} required={q.required} type={q.type==='number'?'number':'text'} step="any" value={draft.raw_answers[q.id]??''} onChange={e=>change({raw_answers:{...draftRef.current!.raw_answers,[q.id]:e.target.value}})} />}</label>)}
        </fieldset>
        <button disabled={busy}>{busy?'Saving…':'Save survey'}</button>
      </form>}
    </>}
    {saved.some(d=>!['editing','superseded','cancelled'].includes(d.status)) && <section aria-label="Saved survey status"><h3>Saved surveys</h3><ul className="plain">{saved.filter(d=>!['editing','superseded','cancelled'].includes(d.status)).map(d=><li key={d.id}>
      <strong>{reference?.versions.find(v=>v.id===d.version_id)?.title??'Saved form'}</strong> · {d.status==='synced'?'Synced':d.status==='rejected'?'Needs review':'Waiting to sync'}
      {d.last_error && <p className="error">{d.last_error}</p>}{d.status==='rejected' && <button disabled={busy} onClick={()=>void review(d)}>Review answers</button>}
    </li>)}</ul></section>}
    <div className="row"><button disabled={busy || !navigator.onLine} onClick={()=>void retry()}>Sync saved surveys</button>{session && !session.finish_requested && <button disabled={busy} onClick={()=>void finish()}>Finish survey visit</button>}</div>
    {error && <p className="error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
  </section>
}
