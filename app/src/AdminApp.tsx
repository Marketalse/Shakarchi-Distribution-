import { Navigate, Route, Routes } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { useSession } from './lib/useSession'
import { useOwnerAccess } from './lib/useOwnerAccess'
import { useSync } from './lib/useSync'
import { Login } from './screens/Login'
import { NewPassword } from './screens/NewPassword'
import { AdminWorkspace } from './screens/AdminWorkspace'

/** Independent website entry. No mobile shell, footer or field routes. */
export function AdminApp() {
  const { session, recovering, finishRecovery } = useSession()
  const access = useOwnerAccess(session?.user.id)
  const sync = useSync(access.allowed ? session?.user.id : undefined)
  if (session === undefined) return <main role="status">Loading admin workspace…</main>
  if (!session) return <div className="admin-auth"><Login landing={null} /></div>
  if (recovering) return <div className="admin-auth"><NewPassword onDone={finishRecovery} /></div>
  if (!access.allowed) return <main><h1>Owner access</h1><p role={access.error ? 'alert' : 'status'}>{access.error || 'Checking owner access…'}</p>{access.error && <button onClick={() => void supabase?.auth.signOut()}>Sign out</button>}</main>
  return <div className="admin-app"><Routes>
    <Route path="/admin/*" element={<AdminWorkspace userId={session.user.id} onSync={sync.syncNow} syncBusy={sync.busy} syncError={sync.error} pendingCount={sync.pending} online={sync.online} />} />
    <Route path="*" element={<Navigate replace to="/admin" />} />
  </Routes></div>
}
