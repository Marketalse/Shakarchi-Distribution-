import 'fake-indexeddb/auto'
import {describe,it,expect} from 'vitest'
import {LocalDb} from './db'
import {bindWorkspaceOwner} from './capture-store'
import {areaChoices,cacheServiceAreas,DEFAULT_SERVICE_AREAS} from './service-areas'
import type {SupabaseClient} from '@supabase/supabase-js'
describe('managed service-area choices',()=>{
 it('maps city labels to existing province identities and retains historical/deactivated choices',()=>{
  expect(areaChoices(DEFAULT_SERVICE_AREAS)).toEqual([{value:'Nineveh',label:'Mosul'},{value:'Kirkuk',label:'Kirkuk'},{value:'Saladin',label:'Salah Aldin'}])
  expect(areaChoices(DEFAULT_SERVICE_AREAS,'Nineveh').at(-1)).toEqual({value:'Nineveh',label:'Nineveh (saved)'})
  const list=DEFAULT_SERVICE_AREAS.map(a=>({...a,active:a.id!=='mosul'}))
  expect(areaChoices(list).some(a=>a.value==='Nineveh')).toBe(false)
  expect(areaChoices(list,'Nineveh').some(a=>a.value==='Nineveh')).toBe(true)
  expect(areaChoices(list,'Baghdad').at(-1)).toEqual({value:'Baghdad',label:'Baghdad (saved)'})
 })
 it('retains owner-bound cached versions after a failed refresh and local reopen',async()=>{
  const db=new LocalDb('areas-'+crypto.randomUUID())
  try{
   await bindWorkspaceOwner(db,'owner')
   let fail=false
   const client={from:()=>({select:()=>({order:async()=>fail?{data:null,error:{message:'offline'}}:{data:DEFAULT_SERVICE_AREAS.map(a=>({...a,version:2})),error:null}})})} as unknown as SupabaseClient
   await cacheServiceAreas(db,'owner',client)
   fail=true;await expect(cacheServiceAreas(db,'owner',client)).rejects.toThrow('retained')
   db.close();await db.open()
   expect(JSON.parse((await db.local_meta.get('service-areas:owner'))!.value)[0].version).toBe(2)
   await expect(cacheServiceAreas(db,'other',client)).rejects.toThrow('verify')
  }finally{await db.delete()}
 })
})
