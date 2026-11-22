import {expect,it,vi} from 'vitest'
import type {SupabaseClient} from '@supabase/supabase-js'
import {supabaseRemote} from './supabase'
it('retains unresolved legacy financial work by refusing direct uploads before touching a remote table',async()=>{
 const from=vi.fn(),remote=supabaseRemote({from} as unknown as SupabaseClient)
 for(const table of ['orders','order_lines','payments'] as const){
  await expect(remote.insertIfMissing(table,{id:'legacy'})).rejects.toThrow('reconciliation of original currency and operation identity')
 }
 expect(from).not.toHaveBeenCalled()
})
