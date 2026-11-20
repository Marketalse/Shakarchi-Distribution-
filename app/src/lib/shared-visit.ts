import type { SupabaseClient } from '@supabase/supabase-js'

/** The server serializes starts per client; switching order/survey reuses one shop stop. */
export async function openSharedVisit(client: SupabaseClient, outletId: string, source: 'order' | 'survey'): Promise<string> {
  const { data, error } = await client.rpc('open_solo_visit', { p_id: crypto.randomUUID(), p_outlet: outletId, p_source: source })
  if (error) throw Object.assign(new Error(error.message), { code: error.code })
  return String(data)
}
