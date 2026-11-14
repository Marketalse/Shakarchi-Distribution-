import { useCallback, useEffect, useRef, useState } from 'react'
import { db } from './db'
import { flush, pendingCount } from './sync'
import { pullReference } from './pull'
import { supabase, supabaseRemote, supabaseSource } from './supabase'

/** Tracks signal and the upload queue. Sync = upload what is waiting, then download fresh lists. */
export function useSync(signedIn: boolean) {
  const [online, setOnline] = useState(navigator.onLine)
  const [pending, setPending] = useState(0)
  const [busy, setBusy] = useState(false)
  const [version, setVersion] = useState(0)
  const running = useRef(false)

  const refresh = useCallback(async () => setPending(await pendingCount(db)), [])

  const syncNow = useCallback(async () => {
    if (!supabase || !signedIn || running.current) return
    running.current = true
    setBusy(true)
    try {
      const result = await flush(db, supabaseRemote(supabase))
      if (!result.stoppedBy) await pullReference(db, supabaseSource(supabase))
    } catch {
      // No signal or a server error: everything stays queued for the next try.
    } finally {
      running.current = false
      setBusy(false)
      setVersion((v) => v + 1)
      await refresh()
    }
  }, [signedIn, refresh])

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

  return { online, pending, busy, syncNow, refresh, version, connected: supabase !== null }
}
