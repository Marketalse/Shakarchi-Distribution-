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

export interface Position { lat: number; lng: number; accuracy_m: number; captured_at: string }

/** Ask the phone for its position. Rejects with a readable message. */
export function getPosition(): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('This phone has no GPS available'))
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const {latitude: lat, longitude: lng, accuracy: accuracy_m} = p.coords
        if (!Number.isFinite(lat) || Math.abs(lat)>90 || !Number.isFinite(lng) || Math.abs(lng)>180 || !Number.isFinite(accuracy_m) || accuracy_m<0 || !Number.isFinite(p.timestamp)) {
          reject(new Error('The device returned an invalid location. Please capture again.')); return
        }
        resolve({ lat, lng, accuracy_m, captured_at: new Date(p.timestamp).toISOString() })
      },
      (e) => reject(new Error(e.code === e.PERMISSION_DENIED ? 'Location permission was refused' : 'Could not get a GPS position')),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    )
  })
}
