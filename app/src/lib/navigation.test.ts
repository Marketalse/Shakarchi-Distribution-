import { describe, expect, it, vi, afterEach } from 'vitest'
import { googleMapsNavigation, wazeNavigation } from './navigation'
import { getPosition } from './geo'

afterEach(() => vi.unstubAllGlobals())
describe('capture once and navigate with the stored destination', () => {
  it('reuses saved coordinates without calling GPS and sends no origin or client data', () => {
    const gps = vi.fn()
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: gps } })
    const first = googleMapsNavigation(33.25,44.25)!
    expect(googleMapsNavigation(33.25,44.25)).toBe(first)
    const url = new URL(first)
    expect(url.origin).toBe('https://www.google.com')
    expect(url.searchParams.get('destination')).toBe('33.25,44.25')
    expect(url.searchParams.get('origin')).toBeNull()
    expect(gps).not.toHaveBeenCalled()
  })
  it('offers both providers with the same saved destination and no new GPS request', () => {
    const gps = vi.fn()
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: gps } })
    const google = new URL(googleMapsNavigation(33.25,44.25)!)
    const waze = new URL(wazeNavigation(33.25,44.25)!)
    expect(waze.origin).toBe('https://waze.com')
    expect(waze.searchParams.get('ll')).toBe(google.searchParams.get('destination'))
    expect(waze.searchParams.get('navigate')).toBe('yes')
    expect([...waze.searchParams.keys()]).toEqual(['ll','navigate'])
    expect(wazeNavigation(33.25,44.25)).toBe(waze.href)
    for (const [lat,lng] of [[91,44],[33,181],[NaN,44],[33,Infinity]]) expect(wazeNavigation(lat,lng)).toBeNull()
    expect(wazeNavigation(0,0)).not.toBeNull()
    expect(gps).not.toHaveBeenCalled()
  })
  it('rejects invalid destinations but permits a real zero coordinate', () => {
    expect(googleMapsNavigation(91,44)).toBeNull()
    expect(googleMapsNavigation(NaN,44)).toBeNull()
    expect(googleMapsNavigation(0,0)).not.toBeNull()
  })
  it('captures fresh quality evidence only on explicit request', async () => {
    const gps = vi.fn((success: PositionCallback, _error?: PositionErrorCallback, _options?: PositionOptions) => success({ coords: { latitude:33.25,longitude:44.25,accuracy:12 },timestamp:1700000000000 } as GeolocationPosition))
    vi.stubGlobal('navigator', {geolocation:{getCurrentPosition:gps}})
    const result = await getPosition()
    expect(result).toEqual({lat:33.25,lng:44.25,accuracy_m:12,captured_at:new Date(1700000000000).toISOString()})
    expect(gps.mock.calls[0][2]).toMatchObject({maximumAge:0,enableHighAccuracy:true,timeout:20000})
  })
  it('reports denied GPS without inventing coordinates', async () => {
    vi.stubGlobal('navigator', {geolocation:{getCurrentPosition: (_:unknown,error:PositionErrorCallback) => error({code:1,PERMISSION_DENIED:1} as GeolocationPositionError)}})
    await expect(getPosition()).rejects.toThrow('permission was refused')
  })
})
