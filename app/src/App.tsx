import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { useSession } from './lib/useSession'
import { useSync } from './lib/useSync'
import { Login } from './screens/Login'
import { Outlets } from './screens/Outlets'
import { NewOutlet } from './screens/NewOutlet'
import { Dashboard, RetailDetail } from './screens/BasicRetail'
import { Orders, OwnerProfile } from './screens/OwnerPages'
import { Visit } from './screens/Visit'
import { OwnerAdmin } from './screens/OwnerAdmin'
import { NewPassword } from './screens/NewPassword'

export default function App() {
  const { session, recovering, finishRecovery } = useSession()
  const sync = useSync(Boolean(session))
  const repId = session?.user.id
  const { pathname } = useLocation()
  const title = pathname === '/dashboard' ? 'Overview'
    : pathname === '/orders' ? 'Orders'
    : pathname === '/me' ? 'Me'
    : pathname === '/admin' ? 'Owner tools'
    : pathname === '/outlets/new' ? 'New retail'
    : pathname.startsWith('/retails/') ? 'Retail'
    : pathname.startsWith('/visit/') ? 'Visit'
    : 'Retails'
  const tabs = [
    ['/dashboard', 'Dashboard', 'dashboard'],
    ['/', 'Retails', 'retails'],
    ['/orders', 'Orders', 'orders'],
    ['/me', 'Me', 'profile'],
  ]

  return (
    <div className="app-shell">
      <header className="top">
        <div>
          <Link to={repId ? '/dashboard' : '/'} className="wordmark">Shakarchi Distribution</Link>
          <h1>{repId ? recovering ? 'New password' : title : 'Sign in'}</h1>
          <p>{repId ? 'Your wholesale workspace' : 'Owner access'}</p>
        </div>
        {repId && <button className="sync-button" onClick={() => void sync.syncNow()}
          disabled={!sync.online || sync.busy} aria-label="Sync records">
          <span className={'signal ' + (sync.online ? 'online' : '')} />
          {sync.busy ? 'Syncing…' : !sync.online ? 'Offline' : sync.pending ? sync.pending + ' pending' : 'Sync'}
        </button>}
      </header>
      {session === undefined ? <main><p role="status">Loading your workspace…</p></main>
        : !repId ? <Login />
        : recovering ? <NewPassword onDone={finishRecovery} />
        : <Routes key={repId}>
          <Route path="/" element={<Outlets version={sync.version + sync.pending} />} />
          <Route path="/outlets/new" element={<NewOutlet repId={repId} onSaved={() => void sync.refresh()} />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/me" element={<OwnerProfile userId={repId} />} />
          <Route path="/admin" element={<OwnerAdmin />} />
          <Route path="/retails/:outletId" element={<RetailDetail version={sync.version + sync.pending} />} />
          <Route path="/visit/:outletId" element={<Visit repId={repId} onSaved={() => void sync.refresh()} />} />
          <Route path="*" element={<main><h2>Page unavailable</h2><Link to="/">Go to retails</Link></main>} />
        </Routes>}
      {repId && !recovering && <nav className="footer-nav" aria-label="Main navigation">
        {tabs.map(([to, label, icon]) => <NavLink end={to === '/'} to={to} key={to}>
          <img src={'/wireframe/' + icon + '.svg'} width="24" height="24" alt="" />
          {label}
        </NavLink>)}
      </nav>}
    </div>
  )
}
