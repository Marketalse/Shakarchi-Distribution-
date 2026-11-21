import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { db } from '../lib/db'
import type { Outlet } from '../lib/types'
import { ClientEdit } from './CaptureForms'
import { ClientLocation } from './ClientLocation'

/** Routes are mounted behind the server-verified sole-owner gate in App. */
export function AdminClients({embedded=false,onChanged}:{embedded?:boolean;onChanged?:()=>void}={}) {
  const { outletId } = useParams()
  const [clients,setClients]=useState<Outlet[]>([])
  const [query,setQuery]=useState(''),[error,setError]=useState('')
  const [revision,setRevision]=useState(0)
  useEffect(()=>{
    let active=true
    async function load(){
      if(outletId && supabase && navigator.onLine){
        const queued=await db.outbox.where('table').equals('outlets').filter(row=>row.row_id===outletId).count()
        if(!queued){
          const {data,error}=await supabase.from('outlets').select('*').eq('id',outletId).single()
          if(error)throw Error(error.message)
          if(data)await db.outlets.put(data as Outlet)
        }
      }
      return db.outlets.orderBy('retail_name').toArray()
    }
    void load().then(rows=>{if(active){setClients(rows);setError('')}},failure=>{if(active)setError(String(failure.message))})
    return()=>{active=false}
  },[revision,outletId])
  const client=clients.find(row=>row.id===outletId)
  return <main>{!embedded&&<><Link to="/admin">Admin hub</Link><h1>Clients</h1></>}
    {error && <p role="alert" className="error">{error}</p>}
    {outletId ? client ? <>
      <Link to="/admin/clients">All clients</Link><h2>{client.retail_name}</h2>
      <ClientEdit key={client.id+client.updated_at} retail={client} hideHeading={embedded} onSaved={()=>{setRevision(v=>v+1);onChanged?.()}}/>
      <ClientLocation retail={client} allowCorrection onUpdated={()=>{setRevision(v=>v+1);onChanged?.()}}/>
    </> : <p>Client unavailable. Sync your records and try again.</p> : <>
      <input type="search" aria-label="Find client" placeholder="Find client" value={query} onChange={e=>setQuery(e.target.value)}/>
      <ul className="list">{clients.filter(row=>[row.retail_name,row.area].some(value=>value.toLowerCase().includes(query.trim().toLowerCase()))).map(row=><li key={row.id}><Link to={'/admin/clients/'+row.id}>{row.retail_name}<span className="muted">{row.area}</span></Link></li>)}</ul>
      {!clients.length && <p>No clients saved on this device. Sync to load them.</p>}
    </>}
  </main>
}
