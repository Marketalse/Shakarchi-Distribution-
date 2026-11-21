import type { LocalDb } from './db'
export class QueuedLocally extends Error {
 constructor(){super('Saved on this device. It will upload automatically when connected.');this.name='QueuedLocally'}
}
export async function offlineOwner(db:LocalDb) {
 const binding=await db.local_meta.get('workspace-owner')
 const disabled=await db.local_meta.get('offline-access-disabled')
 if(!binding || disabled?.value==='true')throw Error('Sign in and sync this device online before using offline mode.')
 const url=import.meta.env.VITE_SUPABASE_URL as string|undefined
 if(url && typeof localStorage!=='undefined'){const saved=localStorage.getItem('sb-'+new URL(url).hostname.split('.')[0]+'-auth-token');if(saved){let identity:string|undefined;try{identity=JSON.parse(saved)?.user?.id}catch{throw Error('Saved sign-in needs online verification. Records are retained.')}if(identity&&identity!==binding.value)throw Error('This device holds another account workspace. Records are retained.')}}
 return binding.value
}
export async function cachedFieldRead<T>(db:LocalDb,key:string,load:()=>Promise<T>,online=typeof navigator==='undefined'||navigator.onLine):Promise<T>{
 const owner=await offlineOwner(db),cacheKey=`field-cache:${owner}:${key}`
 if(online){try{const value=await withTimeout(load(),5000);await db.local_meta.put({key:cacheKey,value:JSON.stringify({at:new Date().toISOString(),data:value})});return value}catch(error){const cached=await db.local_meta.get(cacheKey);if(!cached)throw error;return JSON.parse(cached.value).data as T}}
 const cached=await db.local_meta.get(cacheKey)
 if(!cached)throw Error('Not available offline yet. Sync this device online first.')
 return JSON.parse(cached.value).data as T
}

export async function fieldTable<T>(db:LocalDb,table:string):Promise<T[]|undefined>{
 const owner=await offlineOwner(db),row=await db.local_meta.get(`field-table:${owner}:${table}`)
 return row?JSON.parse(row.value).rows as T[]:undefined
}

export async function withTimeout<T>(work:Promise<T>,ms:number):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined
 try{return await Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Connection timed out. Saved data is retained.')),ms)})])}finally{clearTimeout(timer)}
}
