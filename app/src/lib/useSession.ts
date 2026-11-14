import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { isRecoveryUrl } from './password'

// Read once, before the sign-in library removes the tokens from the address bar.
const openedFromResetLink = typeof window !== 'undefined' && isRecoveryUrl(window.location.href)

/**
 * The signed-in user. `session` is `undefined` while loading and `null` when signed out.
 * `recovering` is true when the user arrived from a password-reset email and must
 * choose a new password before using the app.
 */
export function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null)
  const [recovering, setRecovering] = useState(openedFromResetLink)

  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      setSession(s)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  return { session, recovering, finishRecovery: () => setRecovering(false) }
}
