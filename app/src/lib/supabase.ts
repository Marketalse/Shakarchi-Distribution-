import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Remote } from './sync'
import type { ReferenceSource } from './pull'
import type { Outlet, Product, SurveyBrand } from './types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/** Null until the project URL and key are set in the environment. */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null

/** Sync target backed by Supabase. A row whose id already exists is left alone. */
export function supabaseRemote(client: SupabaseClient): Remote {
  return {
    async insertIfMissing(table, row) {
      if (['orders', 'order_lines', 'payments'].includes(table)) {
        throw Error('Legacy financial rows need reconciliation of original currency and operation identity. No rows were deleted')
      }
      const { error } = await client
        .from(table)
        .upsert(row, { onConflict: 'id', ignoreDuplicates: true })
      if (error) throw new Error(error.message)
    },
  }
}


async function all<T>(client: SupabaseClient, table: string): Promise<T[]> {
  const rows:T[]=[]
  for(let offset=0;;offset+=500){
    const {data,error}=await client.from(table).select('*').order('id').range(offset,offset+499)
    if(error)throw new Error(error.message)
    rows.push(...data as T[])
    if(data.length<500)return rows
  }
}

/** Reference data from Supabase. The access rules decide which outlets come back. */
export function supabaseSource(client: SupabaseClient): ReferenceSource {
  return {
    outlets: () => all<Outlet>(client, 'outlets'),
    products: () => all<Product>(client, 'solo_order_catalog_v2'),
    surveyBrands: async () => {
      const { data, error } = await client.from('survey_brands').select('*').eq('is_own', false).eq('active', true)
      if (error) throw new Error(error.message)
      return (data ?? []) as SurveyBrand[]
    },
  }
}
