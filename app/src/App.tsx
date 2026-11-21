import { lazy, Suspense } from 'react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { useOwnerAccess } from './lib/useOwnerAccess'
import { useSession } from './lib/useSession'
import { useSync } from './lib/useSync'
import { Login } from './screens/Login'
import { Outlets } from './screens/Outlets'
import { NewOutlet } from './screens/NewOutlet'
import { Dashboard, RetailDetail } from './screens/BasicRetail'
import { Orders, OwnerProfile } from './screens/OwnerPages'
import { Visit } from './screens/Visit'
import { MobileIcon } from './screens/MobileIcon'
import { MobileOverview } from './screens/MobileOverview'
import './mobile.css'
import { NewPassword } from './screens/NewPassword'

const AdminWorkspace=lazy(()=>import('./screens/AdminWorkspace').then(module=>({default:module.AdminWorkspace})))

export default function App() {
  const { session, recovering, finishRecovery } = useSession()
  const access = useOwnerAccess(session?.user.id)
  const sync = useSync(access.allowed ? session?.user.id : undefined)
  const repId = session?.user.id
  const { pathname } = useLocation()
  const adminMode=(pathname==='/admin'||pathname.startsWith('/admin/')) && access.allowed && !recovering
  const title = pathname === '/reports' ? 'Reports' : pathname === '/dashboard' ? 'Overview'
    : pathname === '/orders' ? 'Orders'
    : pathname === '/me' ? 'Me'
    : pathname.startsWith('/admin') ? 'Admin hub'
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
    <div className={adminMode?'admin-app':`app-shell mobile-shell ${!repId || recovering ? 'auth-shell' : ''}`}>
      {!adminMode && repId && !recovering && <header className="top">
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
      {!adminMode && access.allowed && sync.error && <p className="error" role="alert">Sync paused: {sync.error}. Pending records are retained.</p>}
      {session === undefined ? <main><p role="status">Loading your workspace…</p></main>
        : !repId ? <Login />
        : recovering ? <NewPassword onDone={finishRecovery} />
        : !access.allowed ? <main><h2>Owner access</h2><p role={access.error ? 'alert' : 'status'}>{access.error || 'Checking owner access…'}</p>{access.error && <button onClick={() => void supabase?.auth.signOut()}>Sign out</button>}</main>
        : <Routes key={repId}>
          <Route path="/" element={<Outlets version={sync.version + sync.pending} />} />
          <Route path="/outlets/new" element={<NewOutlet repId={repId} onSaved={() => void sync.refresh()} />} />
          <Route path="/dashboard" element={<MobileOverview version={sync.version} />} />
          <Route path="/reports" element={<Dashboard version={sync.version} />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/me" element={<OwnerProfile userId={repId} />} />
          <Route path="/admin/*" element={<Suspense fallback={<main role="status">Loading admin workspace…</main>}><AdminWorkspace userId={repId} onSync={sync.syncNow} syncBusy={sync.busy} syncError={sync.error} pendingCount={sync.pending} online={sync.online}/></Suspense>} />
          <Route path="/retails/:outletId" element={<RetailDetail version={sync.version + sync.pending} ownerId={repId} onCaptureChanged={() => void sync.refresh()} onSyncRequested={sync.syncNow} />} />
          <Route path="/visit/:outletId" element={<Visit repId={repId} onSaved={() => void sync.refresh()} />} />
          <Route path="*" element={<main><h2>Page unavailable</h2><Link to="/">Go to retails</Link></main>} />
        </Routes>}
      {repId && access.allowed && !recovering && !adminMode && <nav className="footer-nav" aria-label="Main navigation">
        {tabs.map(([to, label, icon]) => <NavLink end={to === '/'} to={to} key={to}>
          <span className="dock-icon"><MobileIcon name={icon} /></span>
          {label}
        </NavLink>)}
      </nav>}
    </div>
  )
}
