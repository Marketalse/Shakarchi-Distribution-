import { useCallback, useEffect, useState } from 'react'
import { db } from './db'
import { flush, pendingCount } from './sync'
import { supabase, supabaseRemote } from './supabase'

/** Tracks signal and the upload queue, and uploads when the signal returns. */
export function useSync() {
  const [online, setOnline] = useState(navigator.onLine)
  const [pending, setPending] = useState(0)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => setPending(await pendingCount(db)), [])

  const syncNow = useCallback(async () => {
    if (!supabase || busy) return
    setBusy(true)
    try {
      await flush(db, supabaseRemote(supabase))
    } finally {
      setBusy(false)
      await refresh()
    }
  }, [busy, refresh])

  useEffect(() => {
    const up = () => { setOnline(true); void syncNow() }
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    void refresh()
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [refresh, syncNow])

  return { online, pending, busy, syncNow, connected: supabase !== null }
}
