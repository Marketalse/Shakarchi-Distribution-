import type { SupabaseClient } from '@supabase/supabase-js'
import type { LocalDb } from './db'
import { assertWorkspaceOwner } from './capture-store'
export type ServiceArea={id:string;label:string;province:string;active:boolean;version:number}
export const DEFAULT_SERVICE_AREAS:ServiceArea[]=[
 {id:'mosul',label:'Mosul',province:'Nineveh',active:true,version:0},
 {id:'kirkuk',label:'Kirkuk',province:'Kirkuk',active:true,version:0},
 {id:'salah-aldin',label:'Salah Aldin',province:'Saladin',active:true,version:0},
]
export function areaChoices(areas:ServiceArea[],existing?:string){
 const active=areas.filter(a=>a.active && a.province!==existing).map(a=>({value:a.province,label:a.label}))
 if(existing)active.push({value:existing,label:existing+' (saved)'})
 return active
}
export function parseServiceAreas(value:unknown):ServiceArea[]{
 if(!Array.isArray(value) || value.length!==3 || new Set(value.map(row=>row?.id)).size!==3 || !value.every(row=>{
  const expected=DEFAULT_SERVICE_AREAS.find(area=>area.id===row?.id)
  return expected && row.label===expected.label && row.province===expected.province && typeof row.active==='boolean' && Number.isSafeInteger(row.version) && row.version>0
 }))throw Error('Service-area setup is incomplete.')
 return value as ServiceArea[]
}
export async function cacheServiceAreas(db:LocalDb,ownerId:string,client:SupabaseClient){
 await assertWorkspaceOwner(db,ownerId)
 const {data,error}=await client.from('service_areas').select('id,label,province,active,version').order('id')
 if(error)throw Error('Service areas unavailable. Existing saved choices are retained.')
 const areas=parseServiceAreas(data)
 await db.local_meta.put({key:'service-areas:'+ownerId,value:JSON.stringify(areas)})
 return areas
}
