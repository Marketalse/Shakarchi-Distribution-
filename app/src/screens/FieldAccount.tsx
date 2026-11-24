import {useEffect,useState} from 'react'
import {liveQuery} from 'dexie'
import {db} from '../lib/db'
import { supabase } from '../lib/supabase'
import { MobileIcon } from './MobileIcon'

export function FieldAccount() {
  const [cache,setCache]=useState<string>(),[worker,setWorker]=useState(Boolean(navigator.serviceWorker?.controller))
  useEffect(()=>{const sub=liveQuery(()=>db.local_meta.get('offline-data-ready')).subscribe(row=>setCache(row?.value));const ready=()=>setWorker(Boolean(navigator.serviceWorker?.controller));navigator.serviceWorker?.addEventListener('controllerchange',ready);return()=>{sub.unsubscribe();navigator.serviceWorker?.removeEventListener('controllerchange',ready)}},[])

  return <main><section className="card account-card"><span className="account-avatar"><MobileIcon name="user" /></span><div><h2>Field workspace</h2><p className="muted">Client, order and survey capture</p></div></section>
    <section className="card"><h2>{cache&&worker?'Offline data ready':'Preparing offline data'}</h2><p>{cache?'Catalog and invoice history downloaded '+new Date(cache).toLocaleString()+'.':'Open online and let Sync finish once to download reference data.'}</p><p className="muted">Saved submissions upload automatically on reconnect or when this app resumes. Browser storage is local to this device.</p></section>
    <button onClick={() => {void db.local_meta.put({key:'offline-access-disabled',value:'true'}).then(()=>supabase?.auth.signOut({scope:'local'}))}}>Sign out</button>
  </main>
}
