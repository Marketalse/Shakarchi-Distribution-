import type { LocalDb } from './db'
import { enqueue } from './sync'
import type { Outlet } from './types'
import { newId } from './visit'

export type NewOutlet = Omit<Outlet, 'id' | 'updated_at' | 'credit_limit' | 'payment_terms_days'> &
  Partial<Pick<Outlet, 'credit_limit' | 'payment_terms_days'>>

/** Save a new outlet on the phone and queue it for upload. Returns the outlet. */
export async function createOutlet(db: LocalDb, input: NewOutlet): Promise<Outlet> {
  if (!input.retail_name.trim()) throw new Error('The shop needs a name')
  if (!input.area.trim()) throw new Error('The shop needs an area')
  if (!input.province.trim()) throw new Error('The shop needs a province')
  if (!input.outlet_type.trim()) throw new Error('The shop needs an outlet type')
  if (!Number.isFinite(input.lat) || Math.abs(input.lat) > 90 ||
      !Number.isFinite(input.lng) || Math.abs(input.lng) > 180)
    throw new Error('Valid shop coordinates are required')
  const outlet: Outlet = {
    credit_limit: 0,
    payment_terms_days: 0,
    ...input,
    retail_name: input.retail_name.trim(),
    area: input.area.trim(),
    province: input.province.trim(),
    outlet_type: input.outlet_type.trim(),
    id: newId(),
    updated_at: new Date().toISOString(),
  }
  await db.transaction('rw', [db.outlets, db.outbox], async () => {
    await db.outlets.add(outlet)
    await enqueue(db, 'outlets', { ...outlet })
  })
  return outlet
}
