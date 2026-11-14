import type { Outlet } from './types'

/** Distance in metres between two GPS points. */
export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2
  return 6371000 * 2 * Math.asin(Math.sqrt(a))
}

export interface Nearby { id: string; retail_name: string; distance_m: number }

/** Outlets already on the phone that sit within `radiusM` of a point, nearest first. */
export function nearbyOutlets(outlets: Outlet[], lat: number, lng: number, radiusM: number): Nearby[] {
  return outlets
    .map((o) => ({ id: o.id, retail_name: o.retail_name, distance_m: distanceM(lat, lng, o.lat, o.lng) }))
    .filter((n) => n.distance_m <= radiusM)
    .sort((a, b) => a.distance_m - b.distance_m)
}

export interface Position { lat: number; lng: number; accuracy_m: number }

/** Ask the phone for its position. Rejects with a readable message. */
export function getPosition(): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('This phone has no GPS available'))
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy_m: p.coords.accuracy }),
      (e) => reject(new Error(e.code === e.PERMISSION_DENIED ? 'Location permission was refused' : 'Could not get a GPS position')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    )
  })
}
