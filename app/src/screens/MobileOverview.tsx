import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../lib/db'
import { MobileIcon } from './MobileIcon'

/** Field capture only. Reporting and controls belong to the admin website. */
export function MobileOverview({ version }: { version: number }) {
  const [state, setState] = useState<{version:number; clients?:number; drafts?:number; error?:string}>({version})
  useEffect(() => {
    let active = true
    void Promise.all([db.outlets.count(),db.capture_drafts.filter(d => ['editing','queued','rejected'].includes(d.status)).count()]).then(([clients,drafts]) => {
      if(active)setState({version,clients,drafts})
    },error => {if(active)setState({version,error:String(error.message || error)})})
    return () => {active=false}
  },[version])
  const current = state.version === version
  return <main className="mobile-overview">
    <section className="sales-hero"><p>Field workspace</p><strong>Ready for your next visit.</strong><span>Capture once. Keep moving.</span></section>
    {current && state.error && <p role="alert" className="error">{state.error}</p>}
    <Link className="button primary" to="/outlets/new"><MobileIcon name="plus" size={20} />New client</Link>
    <Link className="button primary" to="/?action=order"><MobileIcon name="cart" size={20} />Create order & survey</Link>
    <div className="overview-metrics"><Link to="/" className="overview-metric soft"><MobileIcon name="shop" /><span>Clients on this device</span><strong>{current ? state.clients ?? '—' : '—'}</strong></Link><Link to="/" className="overview-metric"><MobileIcon name="invoice" /><span>Survey drafts on this device</span><strong>{current ? state.drafts ?? '—' : '—'}</strong></Link></div>
    <p className="muted">Use Sync to send saved work. Your submitted work appears in the manager portal.</p>
  </main>
}
