import {withTimeout} from './offline'
import {warmFieldHistory} from './field-reference'
import {uploadPhoto} from './attachments'
import {watchAutoSync} from './auto-sync'
import {verifySyncOwner} from './sync-access'
import { useCallback, useEffect, useRef, useState } from 'react'
import {flushWorkspace} from './workspace-sync'
import { cacheServiceAreas } from './service-areas'
import { captureRemote } from './capture-remote'
import { cacheCaptureReference } from './capture-reference'
import { db } from './db'
import { pendingCount } from './sync'
import { pullReference } from './pull'
import { supabase, supabaseRemote, supabaseSource } from './supabase'

/** Tracks signal and the upload queue. Sync = upload what is waiting, then download fresh lists. */
export function useSync(ownerId: string | undefined) {
  const [online, setOnline] = useState(navigator.onLine)
  const [pending, setPending] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [version, setVersion] = useState(0)
  const running = useRef(false)

  const refresh = useCallback(async () => {
    if (!ownerId) { setPending(0); return }
    const draftCount=ownerId ? await db.capture_drafts.where('owner_id').equals(ownerId).filter(d=>['queued','rejected'].includes(d.status)).count() : 0
    const sessionCount=ownerId ? await db.capture_sessions.where('owner_id').equals(ownerId).filter(v=>!v.finished_at && (!v.server_visit_id || Boolean(v.finish_requested))).count() : 0
    setPending(await pendingCount(db) + draftCount + sessionCount + (ownerId ? await db.commands.where('owner_id').equals(ownerId).count() : 0))
  }, [ownerId])

  const syncNow = useCallback(async () => {
    if (!supabase || !ownerId || running.current) return
    running.current = true
    setBusy(true)
    try {
      if (!navigator.locks) throw Error('Safe sync requires a browser with Web Locks support. Pending records are retained.');
      await navigator.locks.request('wsd-workspace-sync', async () => {
      await withTimeout(verifySyncOwner(supabase!,ownerId,db),10000)
      const capture=captureRemote(supabase!)
      const guarded={openVisit:async(id:string,outlet:string,source?:'order'|'survey')=>{await withTimeout(verifySyncOwner(supabase!,ownerId,db),10000);return capture.openVisit(id,outlet,source)},submit:async(id:string,request:Record<string,unknown>)=>{await withTimeout(verifySyncOwner(supabase!,ownerId,db),10000);return capture.submit(id,request)},finish:async(id:string,visit:string)=>{await withTimeout(verifySyncOwner(supabase!,ownerId,db),10000);return capture.finish(id,visit)}}
      const problems=await flushWorkspace(db,ownerId,{insertIfMissing:async(table,row)=>{await withTimeout(verifySyncOwner(supabase!,ownerId,db),10000);await supabaseRemote(supabase!).insertIfMissing(table,row)}},guarded,async(rpc,id,request)=>{
        const parent=(request as {outlet_id?:string}).outlet_id
        if(parent && await db.outbox.where('table').equals('outlets').filter(row=>row.row_id===parent).count())throw Error('Client is saved locally and waiting to upload.')
        await withTimeout(verifySyncOwner(supabase!,ownerId,db),10000);await uploadPhoto(db,supabase!,ownerId,id)
        const {data,error}=await supabase!.rpc(rpc,{p_operation:id,p_request:request});if(error)throw Object.assign(Error(error.message),{code:error.code});return data
      })
      try{await pullReference(db, supabaseSource(supabase!));await cacheCaptureReference(db,ownerId,supabase!)}catch(e){problems.push(e instanceof Error?e.message:String(e))}
      try{await cacheServiceAreas(db,ownerId,supabase!)}catch{/* Retain cached choices. */}
      try{await warmFieldHistory(db,ownerId,supabase!)}catch(e){problems.push(e instanceof Error?e.message:String(e))}
      await db.local_meta.put({key:problems.length?'last-sync-attempt':'last-sync',value:new Date().toISOString()})
      setError(problems.join(' · '))
      })
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      running.current = false
      setBusy(false)
      setVersion((v) => v + 1)
      try{await refresh()}catch(e){setError(e instanceof Error?e.message:String(e))}
    }
  }, [ownerId, refresh])

  useEffect(() => {
    const up = () => { setOnline(true); void syncNow() }
    const down = () => setOnline(false)
    const stop=watchAutoSync(db,syncNow,refresh)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    void refresh()
    if (navigator.onLine) void syncNow()
    return () => {
      stop()
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [refresh, syncNow])

  return { online, pending, busy, syncNow, refresh, version, error, connected: supabase !== null }
}
