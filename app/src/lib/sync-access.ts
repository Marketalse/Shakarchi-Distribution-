import type {SupabaseClient} from '@supabase/supabase-js'
import type {LocalDb} from './db'
async function deny(db:LocalDb|undefined){if(db){await db.local_meta.put({key:'offline-access-disabled',value:'true'});if(typeof window!=='undefined')window.dispatchEvent(new Event('wsd-access-denied'))}}
/** Offline cache is not upload permission. Lock it after a definitive online denial. */
export async function verifySyncOwner(client: SupabaseClient, ownerId: string, db?:LocalDb) {
 const {data,error}=await client.auth.getUser()
 if(error || data.user?.id!==ownerId){if(!error || error.status===401 || error.status===403)await deny(db);throw Error('Reconnect and verify the original owner before syncing.')}
 const profile=await client.from('profiles').select('id').eq('id',ownerId).maybeSingle()
 if(profile.error || !profile.data){if(!profile.error || profile.error.code==='42501')await deny(db);throw Error('Owner access could not be verified; pending work is retained.')}
}
