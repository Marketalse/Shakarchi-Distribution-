import type {SupabaseClient} from '@supabase/supabase-js'
/** Cached UI is not permission to upload. Recheck online identity and owner profile. */
export async function verifySyncOwner(client: SupabaseClient, ownerId: string) {
 const {data,error}=await client.auth.getUser()
 if(error || data.user?.id!==ownerId)throw Error('Reconnect and verify the original owner before syncing.')
 const profile=await client.from('profiles').select('id').eq('id',ownerId).maybeSingle()
 if(profile.error || !profile.data)throw Error('Owner access could not be verified; pending work is retained.')
}
