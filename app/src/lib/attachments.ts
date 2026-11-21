import type {LocalDb} from './db'
import type {SupabaseClient} from '@supabase/supabase-js'
export type PendingPhoto={id:string;owner_id:string;path:string;blob:Blob;digest:string}
const digest=async(blob:Blob)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))).map(x=>x.toString(16).padStart(2,'0')).join('')
export async function stagePhoto(db:LocalDb,owner:string,id:string,request:unknown,file?:File){
 if(file && (!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5242880))throw Error('Choose a JPEG, PNG or WebP photo up to 5 MB.')
 const photo=file?{id,owner_id:owner,path:owner+'/'+id,blob:file,digest:await digest(file)}:undefined
 await db.transaction('rw',[db.commands,db.attachments],async()=>{
  const prior=await db.commands.get(id)
  if(prior && (prior.owner_id!==owner||JSON.stringify(prior.request)!==JSON.stringify(request)))throw Error('Saved observation has different details.')
  if(!prior)await db.commands.add({id,owner_id:owner,rpc:'submit_solo_observation',request,queued_at:new Date().toISOString(),attempts:0})
  if(photo){const old=await db.attachments.get(id);if(old&&old.digest!==photo.digest)throw Error('Saved photo cannot be replaced.');await db.attachments.put(photo)}
 })
}
export async function uploadPhoto(db:LocalDb,client:SupabaseClient,owner:string,id:string){
 const photo=await db.attachments.get(id);if(!photo)return
 if(photo.owner_id!==owner)throw Error('Photo belongs to another workspace.')
 const bucket=client.storage.from('market-surveys');const {error}=await bucket.upload(photo.path,photo.blob)
 if(error){if(String((error as {statusCode?:string}).statusCode)!=='409')throw error;const {data,error:downloadError}=await bucket.download(photo.path);if(downloadError||!data||await digest(data)!==photo.digest)throw Error('Photo upload conflict. Original photo retained for review.')}
}
