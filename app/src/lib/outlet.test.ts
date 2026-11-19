import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { LocalDb } from './db'
import { createOutlet, type NewOutlet } from './outlet'
import { distanceM, nearbyOutlets } from './geo'
import { pullReference, type ReferenceSource } from './pull'
import { pendingCount } from './sync'
import type { Outlet } from './types'

const base: NewOutlet = {
  retail_name: ' Cloud Nine ', province: 'Erbil', area: 'Ankawa', outlet_type: 'Vape shop',
  relationship: 'prospect', lat: 36.2296, lng: 43.9933, assigned_rep: 'rep-1',
}

let db: LocalDb
let n = 0
beforeEach(() => { db = new LocalDb(`outlet-test-${++n}`) })

describe('creating an outlet', () => {
  it('saves it on the phone, tidies the name and queues it for upload', async () => {
    const outlet = await createOutlet(db, base)
    expect(outlet.retail_name).toBe('Cloud Nine')
    expect(outlet.credit_limit).toBe(0)
    expect(await db.outlets.count()).toBe(1)
    expect(await pendingCount(db)).toBe(1)
  })

  it('refuses a shop with no name and saves nothing', async () => {
    await expect(createOutlet(db, { ...base, retail_name: '  ' })).rejects.toThrow()
    expect(await db.outlets.count()).toBe(0)
    expect(await pendingCount(db)).toBe(0)
  })
  it.each([
    { province: ' ' }, { outlet_type: ' ' }, { lat: Number.NaN }, { lat: 91 }, { lng: 181 },
  ])('rejects incomplete database fields before queuing %o', async (changes) => {
    await expect(createOutlet(db, { ...base, ...changes })).rejects.toThrow()
    expect(await db.outlets.count()).toBe(0)
    expect(await pendingCount(db)).toBe(0)
  })

})

describe('spotting duplicates by GPS', () => {
  it('measures distance correctly', () => {
    // One thousandth of a degree of latitude is about 111 m.
    expect(distanceM(36.0, 44.0, 36.001, 44.0)).toBeGreaterThan(110)
    expect(distanceM(36.0, 44.0, 36.001, 44.0)).toBeLessThan(112)
  })

  it('finds a shop 20 m away but not one 300 m away', async () => {
    const near = await createOutlet(db, base)
    await createOutlet(db, { ...base, retail_name: 'Far Shop', lat: base.lat + 0.0027 })
    const found = nearbyOutlets(await db.outlets.toArray(), base.lat + 0.00018, base.lng, 50)
    expect(found.map((f) => f.id)).toEqual([near.id])
  })
})

describe('downloading lists from the server', () => {
  const serverOutlet: Outlet = {
    id: 'srv-1', retail_name: 'Server Shop', province: 'Erbil', area: 'Bakhtiari', outlet_type: 'Kiosk',
    relationship: 'customer', lat: 36.19, lng: 44.01, assigned_rep: 'rep-1',
    credit_limit: 500000, payment_terms_days: 14, updated_at: '2026-11-14T00:00:00Z',
  }
  const source = (outlets: Outlet[]): ReferenceSource => ({
    outlets: async () => outlets,
    products: async () => [{ id: 'p1', product_line: 'KNZ Bar 60K', flavour: 'Cola Ice', wholesale_price: 1, currency: 'IQD', active: true }],
    surveyBrands: async () => [],
  })

  it('adds server outlets and replaces the product list', async () => {
    const result = await pullReference(db, source([serverOutlet]))
    expect(result).toEqual({ outlets: 1, products: 1, brands: 0 })
    expect((await db.outlets.get('srv-1'))?.retail_name).toBe('Server Shop')
    expect(await db.products.count()).toBe(1)
  })

  it('never overwrites an outlet that is still waiting to upload', async () => {
    const mine = await createOutlet(db, base)
    await pullReference(db, source([{ ...serverOutlet, id: mine.id, retail_name: 'Stale Server Copy' }]))
    expect((await db.outlets.get(mine.id))?.retail_name).toBe('Cloud Nine')
  })
})
