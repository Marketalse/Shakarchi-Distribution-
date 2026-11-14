import { Link, Route, Routes } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { useSession } from './lib/useSession'
import { useSync } from './lib/useSync'
import { Login } from './screens/Login'
import { Outlets } from './screens/Outlets'
import { NewOutlet } from './screens/NewOutlet'
import { Visit } from './screens/Visit'
import { NewPassword } from './screens/NewPassword'
import { en as t } from './i18n/en'

export default function App() {
  const { session, recovering, finishRecovery } = useSession()
  const sync = useSync(Boolean(session))
  const repId = session?.user.id

  return (
    <>
      <header className="bar">
        <Link to="/" className="brand">{t.appName}</Link>
        <span className={sync.online ? 'pill ok' : 'pill warn'}>{sync.online ? t.online : t.offline}</span>
        <span className="grow">{sync.connected ? t.pending(sync.pending) : t.notConnected}</span>
        {repId && (
          <>
            <button onClick={() => void sync.syncNow()} disabled={!sync.online || sync.busy}>
              {sync.busy ? t.syncing : t.syncNow}
            </button>
            <button onClick={() => void supabase?.auth.signOut()}>{t.signOut}</button>
          </>
        )}
      </header>
      {session === undefined ? null : !repId ? (
        <Login />
      ) : recovering ? (
        <NewPassword onDone={finishRecovery} />
      ) : (
        <Routes>
          <Route path="/" element={<Outlets version={sync.version + sync.pending} />} />
          <Route path="/outlets/new" element={<NewOutlet repId={repId} onSaved={() => void sync.refresh()} />} />
          <Route path="/visit/:outletId" element={<Visit repId={repId} onSaved={() => void sync.refresh()} />} />
        </Routes>
      )}
    </>
  )
}
