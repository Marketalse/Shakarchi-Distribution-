import { googleMapsNavigation, wazeNavigation } from '../lib/navigation'
import type { Outlet } from '../lib/types'

/** Navigation uses the saved store pin; never requests device GPS. */
export function StoreNavigation({retail}:{retail:Pick<Outlet,'lat'|'lng'|'retail_name'>}) {
 const google=googleMapsNavigation(retail.lat,retail.lng),waze=wazeNavigation(retail.lat,retail.lng)
 if(!google || !waze)return <span className="muted">Location unavailable</span>
 return <div className="store-navigation" role="group" aria-label={'Navigate to '+retail.retail_name}>
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
  <a className="button" href={google} target="_blank" rel="noopener noreferrer" aria-label={'Open Google Maps for '+retail.retail_name}>Google Maps</a>
  <a className="button" href={waze} target="_blank" rel="noopener noreferrer" aria-label={'Open Waze for '+retail.retail_name}>Waze</a>
 </div>
}
