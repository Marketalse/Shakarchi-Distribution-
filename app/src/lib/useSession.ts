import {db} from './db'
import {offlineOwner} from './offline'
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
  const [offlineOwnerId,setOfflineOwnerId]=useState<string>()
  const [recovering, setRecovering] = useState(openedFromResetLink)

  useEffect(() => {
    if (!supabase) return
    const updateOffline=()=>{if(navigator.onLine){void supabase!.auth.getSession().then(({data,error})=>{if(data.session){setSession(data.session);setOfflineOwnerId(undefined)}else if(!error){setSession(null);setOfflineOwnerId(undefined)}});return}void offlineOwner(db).then(setOfflineOwnerId,()=>setOfflineOwnerId(undefined))}
    updateOffline();window.addEventListener('offline',updateOffline);window.addEventListener('online',updateOffline)
    const fallback=setTimeout(()=>{void offlineOwner(db).then(setOfflineOwnerId,()=>{})},5000)
    void supabase.auth.getSession().then(({ data,error }) => {clearTimeout(fallback);setSession(data.session);if(!data.session&&!error&&navigator.onLine)setOfflineOwnerId(undefined)}).catch(()=>{void offlineOwner(db).then(setOfflineOwnerId,()=>setSession(null))})
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if(event==='SIGNED_OUT'){if(navigator.onLine){setOfflineOwnerId(undefined);void db.local_meta.put({key:'offline-access-disabled',value:'true'})}else updateOffline()}
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      setSession(s)
    })
    return () => {clearTimeout(fallback);data.subscription.unsubscribe();window.removeEventListener('offline',updateOffline);window.removeEventListener('online',updateOffline)}
  }, [])

  return { session, offlineOwnerId, recovering, finishRecovery: () => setRecovering(false) }
}
