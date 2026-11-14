import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Remote } from './sync'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/** Null until the project URL and key are set in the environment. */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null

/** Sync target backed by Supabase. A row whose id already exists is left alone. */
export function supabaseRemote(client: SupabaseClient): Remote {
  return {
    async insertIfMissing(table, row) {
      const { error } = await client
        .from(table)
        .upsert(row, { onConflict: 'id', ignoreDuplicates: true })
      if (error) throw new Error(error.message)
    },
  }
}
