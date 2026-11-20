const validDestination = (lat: number, lng: number) => typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180

/** Uses only the stored destination. The external app determines its own origin. */
export function googleMapsNavigation(lat: number, lng: number): string | null {
  if (!validDestination(lat,lng)) return null
  const query = new URLSearchParams({ api: '1', destination: `${lat},${lng}`, travelmode: 'driving', dir_action: 'navigate' })
  return 'https://www.google.com/maps/dir/?' + query.toString()
}

/** HTTPS opens the provider app when available, otherwise its website. */
export function wazeNavigation(lat: number, lng: number): string | null {
  if (!validDestination(lat,lng)) return null
  return 'https://waze.com/ul?' + new URLSearchParams({ll: `${lat},${lng}`, navigate: 'yes'}).toString()
}
