/** Cross-app handoff includes only known record/search parameters, never auth tokens. */
export function websiteLink(base: string | undefined, path: string): string | undefined {
  if (!base) return undefined
  try {
    const origin = new URL(base)
    if (origin.username || origin.password || (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost','127.0.0.1'].includes(origin.hostname)))) return undefined
    if (!path.startsWith('/') || path.startsWith('//')) return undefined
    const target = new URL(path, origin.origin)
    if (target.origin !== origin.origin) return undefined
    const query = new URLSearchParams()
    for (const key of ['invoice','q']) { const value=target.searchParams.get(key); if(value)query.set(key,value) }
    return origin.origin + target.pathname + (query.size ? '?' + query.toString() : '')
  } catch { return undefined }
}
export const fieldWebsite = (path: string) => websiteLink(import.meta.env.VITE_FIELD_APP_URL, path)
