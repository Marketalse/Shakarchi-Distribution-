import { useCallback, useEffect, useRef, useState } from 'react'
import { flushCapture } from './capture-store'
import { captureRemote } from './capture-remote'
import { cacheCaptureReference } from './capture-reference'
import { flushCommands } from './commands'
import { db } from './db'
import { flush, pendingCount } from './sync'
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
      const result = await flush(db, supabaseRemote(supabase))
      const problems:string[]=[]
      if (result.stoppedBy) {
        if (await db.outbox.where('table').equals('outlets').count()) throw Error(result.stoppedBy)
        problems.push(result.stoppedBy)
      }
      await flushCapture(db,ownerId,captureRemote(supabase))
      await flushCommands(db, ownerId, async (rpc, id, request) => {
        const { data, error } = await supabase!.rpc(rpc, { p_operation: id, p_request: request })
        if (error) throw Object.assign(new Error(error.message), { code: error.code })
        return data
      })
      await pullReference(db, supabaseSource(supabase))
      await cacheCaptureReference(db,ownerId,supabase)
      setError(problems.join(' · '))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      running.current = false
      setBusy(false)
      setVersion((v) => v + 1)
      await refresh()
    }
  }, [ownerId, refresh])

  useEffect(() => {
    const up = () => { setOnline(true); void syncNow() }
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    void refresh()
    if (navigator.onLine) void syncNow()
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [refresh, syncNow])

  return { online, pending, busy, syncNow, refresh, version, error, connected: supabase !== null }
}
