import type { LocalDb } from './db'
import type { Outlet, Product, SurveyBrand } from './types'

/** Where reference data comes from. Supabase in the app, a fake in tests. */
export interface ReferenceSource {
  outlets(): Promise<Outlet[]>
  products(): Promise<Product[]>
  surveyBrands(): Promise<SurveyBrand[]>
}

/**
 * Download outlets, products and survey brands to the phone.
 * Outlets still waiting in the upload queue are kept as they are on the phone,
 * so a download can never overwrite something the rep has not uploaded yet.
 */
export async function pullReference(db: LocalDb, source: ReferenceSource): Promise<{ outlets: number; products: number; brands: number }> {
  const [outlets, products, brands] = await Promise.all([source.outlets(), source.products(), source.surveyBrands()])
  const queued = new Set((await db.outbox.where('table').equals('outlets').toArray()).map((i) => i.row_id))
  await db.transaction('rw', [db.outlets, db.products, db.survey_brands], async () => {
    await db.outlets.bulkPut(outlets.filter((o) => !queued.has(o.id)))
    await db.products.clear()
    await db.products.bulkPut(products)
    await db.survey_brands.clear()
    await db.survey_brands.bulkPut(brands)
  })
  return { outlets: outlets.length, products: products.length, brands: brands.length }
}
