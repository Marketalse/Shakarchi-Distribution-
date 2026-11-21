import type { SupabaseClient } from '@supabase/supabase-js'
import type { CaptureRemote } from './capture-store'
const failure=(error:{message:string;code?:string})=>Object.assign(Error(error.message),{code:error.code})
export function captureRemote(client: SupabaseClient): CaptureRemote {
 return {
  async openVisit(id,outlet) {
   const {data,error}=await client.rpc('open_solo_visit',{p_id:id,p_outlet:outlet,p_source:'survey'})
   if(error)throw failure(error)
   return String(data)
  },
  async submit(id,request) {
   const {data,error}=await client.rpc('submit_solo_survey',{p_operation:id,p_request:request})
   if(error)throw failure(error)
   return data
  },
  async finish(id,visit) {
   const {data,error}=await client.rpc('finish_solo_visit',{p_operation:id,p_request:{visit_id:visit}})
   if(error)throw failure(error)
   return data
  },
 }
}
