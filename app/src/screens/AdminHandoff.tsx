import { useLocation } from 'react-router-dom'
import { websiteLink } from '../lib/app-links'

export function AdminHandoff({path}:{path?:string}={}) {
  const location = useLocation()
  const target = websiteLink(import.meta.env.VITE_ADMIN_APP_URL, path || location.pathname + location.search)
  // Explicit link keeps the website boundary visible and avoids redirect loops.
  return <main><h2>Admin website</h2>{target && new URL(target).origin !== window.location.origin ? <><p className="muted">Administration opens in a separate website. Sign in there with your owner account.</p><a className="button primary" href={target}>Open admin website</a></> : <p role="status">The separate admin website is awaiting its deployment address.</p>}</main>
}
