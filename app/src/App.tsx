import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { useOwnerAccess } from './lib/useOwnerAccess'
import { useSession } from './lib/useSession'
import { useSync } from './lib/useSync'
import { Login } from './screens/Login'
import { Outlets } from './screens/Outlets'
import { NewOutlet } from './screens/NewOutlet'
import { RetailDetail } from './screens/BasicRetail'
import { Orders } from './screens/OwnerPages'
import { Visit } from './screens/Visit'
import { MobileIcon } from './screens/MobileIcon'
import { MobileOverview } from './screens/MobileOverview'
import './mobile.css'
import { NewPassword } from './screens/NewPassword'

import { FieldAccount } from './screens/FieldAccount'
import { AdminHandoff } from './screens/AdminHandoff'

export default function App() {
  const { session, offlineOwnerId, recovering, finishRecovery } = useSession()
  const repId = session?.user.id ?? offlineOwnerId
  const access = useOwnerAccess(repId)
  const sync = useSync(access.allowed ? repId : undefined)
  const { pathname } = useLocation()
  const title = pathname === '/reports' ? 'Reports' : pathname === '/dashboard' ? 'Overview'
    : pathname === '/orders' ? 'Orders'
    : pathname === '/me' ? 'Me'
    : pathname.startsWith('/admin') ? 'Admin website'
    : pathname === '/outlets/new' ? 'New client'
    : pathname.startsWith('/retails/') ? 'Retail'
    : pathname.startsWith('/visit/') ? 'Visit'
    : 'Your clients'
  const tabs = [
    ['/dashboard', 'Overview', 'home'],
    ['/', 'Clients', 'shop'],
    ['/orders', 'Orders', 'cart'],
    ['/me', 'Me', 'user'],
  ]

  return (
    <div className={`app-shell mobile-shell ${!repId || recovering ? 'auth-shell' : ''}`}>
      {repId && !recovering && <header className="top">
        <div>
          <Link to={repId ? '/dashboard' : '/'} className="wordmark">Shakarchi Distribution</Link>
          <h1>{repId ? recovering ? 'New password' : title : 'Sign in'}</h1>
          <p>{pathname === '/dashboard' ? 'Let’s make it count.' : pathname === '/' ? 'Every relationship matters.' : pathname === '/orders' ? 'Your invoices, all in one place.' : pathname === '/outlets/new' ? 'Start a new relationship.' : pathname === '/me' ? 'Your account and tools.' : 'Your wholesale workspace'}</p>
        </div>
        {repId && access.allowed && <button className="sync-button" onClick={() => void sync.syncNow()}
          disabled={!sync.online || sync.busy} aria-label="Sync records">
          <span className={'signal ' + (sync.online ? 'online' : '')} />
          {sync.busy ? 'Syncing…' : !sync.online ? 'Offline' : sync.pending ? sync.pending + ' pending' : 'Sync'}
        </button>}
      </header>}
      {access.allowed && (!sync.online || Boolean(sync.error)) && <p role="status" className="muted">Saved data is available on this device; balances may be from the last sync. Submitted work uploads automatically when connected.</p>}
      {access.allowed && sync.error && <p className="error" role="alert">Sync paused: {sync.error}. Pending records are retained.</p>}
      {session === undefined && !offlineOwnerId ? <main><p role="status">Loading your workspace…</p></main>
        : !repId ? <Login />
        : recovering ? <NewPassword onDone={finishRecovery} />
        : !access.allowed ? <main><h2>Owner access</h2><p role={access.error ? 'alert' : 'status'}>{access.error || 'Checking owner access…'}</p>{access.error && <button onClick={() => void supabase?.auth.signOut()}>Sign out</button>}</main>
        : <Routes key={repId}>
          <Route path="/" element={<Outlets version={sync.version + sync.pending} />} />
          <Route path="/outlets/new" element={<NewOutlet repId={repId} onSaved={() => void sync.refresh()} />} />
          <Route path="/dashboard" element={<MobileOverview version={sync.version} />} />
          <Route path="/reports" element={<AdminHandoff path="/admin" />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/me" element={<FieldAccount />} />
          <Route path="/admin/*" element={<AdminHandoff />} />
          <Route path="/retails/:outletId" element={<RetailDetail version={sync.version + sync.pending} ownerId={repId} onCaptureChanged={() => void sync.refresh()} onSyncRequested={sync.syncNow} />} />
          <Route path="/visit/:outletId" element={<Visit repId={repId} onSaved={() => void sync.refresh()} />} />
          <Route path="*" element={<main><h2>Page unavailable</h2><Link to="/">Go to retails</Link></main>} />
        </Routes>}
      {repId && access.allowed && !recovering && <nav className="footer-nav" aria-label="Main navigation">
        {tabs.map(([to, label, icon]) => <NavLink end={to === '/'} to={to} key={to}>
          <span className="dock-icon"><MobileIcon name={icon} /></span>
          {label}
        </NavLink>)}
      </nav>}
    </div>
  )
}
