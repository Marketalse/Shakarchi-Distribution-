import { useEffect, useState } from 'react'
import { db } from './db'
import { supabase } from './supabase'
import { bindWorkspaceOwner } from './capture-store'

export function useOwnerAccess(ownerId?: string) {
  const [state,setState]=useState<{id?:string;allowed:boolean;error?:string}>({allowed:false})
  useEffect(()=>{
    let active=true
    if (!ownerId || !supabase) return
    async function verify() {
      const binding=await db.local_meta.get('workspace-owner')
      if (binding && binding.value!==ownerId) throw Error('This device belongs to another owner workspace. Sign out to protect its saved records.')
      if (!navigator.onLine && binding?.value===ownerId) return
      const {data,error}=await supabase!.from('profiles').select('id').eq('id',ownerId!).maybeSingle()
      if (error) {
        // Cached access is available only to the previously server-verified owner.
        if (binding?.value===ownerId && !error.code) return
        throw Error('Could not verify owner access. Reconnect and try again.')
      }
      if (!data) throw Error('This account cannot access the owner workspace.')
      await bindWorkspaceOwner(db,ownerId!)
    }
    void verify().then(()=>{if(active)setState({id:ownerId,allowed:true})},failure=>{if(active)setState({id:ownerId,allowed:false,error:String(failure.message)})})
    return ()=>{active=false}
  },[ownerId])
  return state.id===ownerId ? state : {id:ownerId,allowed:false}
}
