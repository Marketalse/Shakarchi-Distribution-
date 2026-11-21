import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useServiceAreas } from '../lib/useServiceAreas'
import { cacheServiceAreas,type ServiceArea } from '../lib/service-areas'
import { db } from '../lib/db'
import { supabase } from '../lib/supabase'
import { operation,soloApi } from '../lib/solo-api'
export function ServiceAreas({embedded=false}:{embedded?:boolean}={}){
 const {areas,configured,error}=useServiceAreas()
 const [busy,setBusy]=useState(false),[failure,setFailure]=useState(''),[notice,setNotice]=useState('')
 async function toggle(area:ServiceArea){
  if(!supabase || busy || !configured)return
  setBusy(true);setFailure('');setNotice('')
  try{
   const owner=(await db.local_meta.get('workspace-owner'))?.value;if(!owner)throw Error('Verify owner access first.')
   const pending=(await db.commands.where('owner_id').equals(owner).toArray()).find(c=>c.rpc==='set_solo_service_area')
   if(pending)throw Error('An area change is waiting to sync. Use Sync before another change.')
   await soloApi(supabase).setServiceArea(operation({id:area.id,active:!area.active,expected_version:area.version}))
   await cacheServiceAreas(db,owner,supabase);setNotice('Area updated.')
  }catch(e){setFailure(String((e as Error).message))}finally{setBusy(false)}
 }
 return <main>{!embedded&&<><Link to="/admin">Admin hub</Link><h1>Service areas</h1></>}<p className="muted">Controls new client choices. Saved client locations stay unchanged.</p>
  {!configured && <p role="status">Database setup pending. The initial three choices remain available for capture.</p>}
  {error && <p className="muted">{error}</p>}
  <ul className="list">{areas.map(area=><li key={area.id}><span>{area.label}</span><button role="switch" aria-checked={area.active} aria-label={area.label+' active'} disabled={busy || !configured} onClick={()=>void toggle(area)}>{area.active?'Active':'Inactive'}</button></li>)}</ul>
  {failure && <p role="alert" className="error">{failure}</p>}{notice && <p role="status">{notice}</p>}
 </main>
}
