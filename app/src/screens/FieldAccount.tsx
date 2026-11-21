import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { MobileIcon } from './MobileIcon'

export function FieldAccount() {
  return <main><section className="card account-card"><span className="account-avatar"><MobileIcon name="user" /></span><div><h2>Field workspace</h2><p className="muted">Client, order and survey capture</p></div></section>
    <Link className="card card-link" to="/admin"><MobileIcon name="settings" />Open admin website <span aria-hidden="true">→</span></Link>
    <p className="muted">Manage your profile, catalog, prices and reports in the admin website.</p>
    <button onClick={() => void supabase?.auth.signOut()}>Sign out</button>
  </main>
}
