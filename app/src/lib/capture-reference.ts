import type { SupabaseClient } from '@supabase/supabase-js'
import type { LocalDb } from './db'
import type { SurveyVersion } from './capture-store'
import { assertWorkspaceOwner } from './capture-store'
import type { SurveyBrand } from './types'

export async function cacheCaptureReference(db:LocalDb,ownerId:string,client:SupabaseClient) {
 await assertWorkspaceOwner(db,ownerId)
 async function all<T>(table:string,columns:string,filter?:boolean):Promise<T[]> {
  const result:T[]=[]
  for(let offset=0;;offset+=500){
   let query=client.from(table).select(columns).order('id').range(offset,offset+499)
   if(filter)query=query.eq('is_own',false).eq('active',true)
   const {data,error}=await query
   if(error)throw Error(error.message)
   result.push(...data as T[])
   if(data.length<500)return result
  }
 }
 const [versions,brands]=await Promise.all([
  all<SurveyVersion>('survey_versions','id,title,questions'),
  all<SurveyBrand>('survey_brands','id,name,is_own,active',true),
 ])
 const reference={owner_id:ownerId,versions,brands,cached_at:new Date().toISOString()}
 await db.capture_reference.put(reference)
 return reference
}
