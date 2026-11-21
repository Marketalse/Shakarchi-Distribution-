import { useEffect,useState } from 'react'
import { liveQuery } from 'dexie'
import { db } from './db'
import { supabase } from './supabase'
import { DEFAULT_SERVICE_AREAS,parseServiceAreas,cacheServiceAreas,type ServiceArea } from './service-areas'
export function useServiceAreas(){
 const [areas,setAreas]=useState<ServiceArea[]>(DEFAULT_SERVICE_AREAS)
 const [configured,setConfigured]=useState(false),[error,setError]=useState('')
 useEffect(()=>{
  let active=true
  const watch=liveQuery(async()=>{const owner=(await db.local_meta.get('workspace-owner'))?.value;return owner?db.local_meta.get('service-areas:'+owner):undefined}).subscribe({next:row=>{if(row){try{setAreas(parseServiceAreas(JSON.parse(row.value)));setConfigured(true)}catch{setError('Saved area list could not be read. Sync again.')}}},error:failure=>setError(String(failure))})
  async function load(){const owner=(await db.local_meta.get('workspace-owner'))?.value;if(owner && navigator.onLine && supabase)await cacheServiceAreas(db,owner,supabase)}
  void load().catch(failure=>{if(active)setError(String(failure.message))})
  return()=>{active=false;watch.unsubscribe()}
 },[])
 return {areas,configured,error}
}
