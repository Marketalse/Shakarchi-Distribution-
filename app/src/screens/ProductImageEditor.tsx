import {useEffect,useState} from 'react'
import {supabase} from '../lib/supabase'
import {db} from '../lib/db'
import {offlineOwner} from '../lib/offline'
import {normaliseProductImage,validProductImagePath} from '../lib/product-images'
import {ProductImage} from './ProductImage'
type Attempt={operation:string;path:string|null;expected:string|null;blob?:Blob;uploaded?:boolean}
/** Separate media mutation cannot change product pricing or any issued invoice. */
export function ProductImageEditor({productId,onChanged}:{productId:string;onChanged:()=>void}){
 const [current,setCurrent]=useState<{path:string|null;label:string}>(),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const [revision,setRevision]=useState(0),[busy,setBusy]=useState(false),[attempt,setAttempt]=useState<Attempt>()
 useEffect(()=>{let active=true;void (async()=>{if(!supabase)throw Error('Connect to load the product image.');const {data,error}=await supabase.from('products').select('image_path,flavour').eq('id',productId).single();if(error)throw error;if(active){setCurrent({path:data.image_path,label:data.flavour});setError('')}})().catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[productId,revision])
 async function save(item:Attempt){
  if(busy||!supabase)return;setBusy(true);setError('');setNotice('');setAttempt(item)
  try{
   if(!navigator.onLine)throw Error('Connect to save product images. Keep this page open to retry.')
   const owner=await offlineOwner(db),{data:auth,error:authError}=await supabase.auth.getUser()
   if(authError||auth.user?.id!==owner)throw Error('Verify this owner account online before updating images.')
   if(item.path){if(!validProductImagePath(item.path,owner,productId))throw Error('Invalid image identity.');if(!item.uploaded){const {error:uploadError}=await supabase.storage.from('product-images').upload(item.path,item.blob!,{contentType:'image/webp',cacheControl:'31536000',upsert:false});if(uploadError){if(String((uploadError as {statusCode?:string}).statusCode)!=='409')throw uploadError;const {data:existing,error:verifyError}=await supabase.storage.from('product-images').download(item.path);if(verifyError||!existing)throw Error('Could not verify the retained upload. Retry.');const digest=async(b:Blob)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await b.arrayBuffer()))).join(',');if(await digest(existing)!==await digest(item.blob!))throw Error('Image upload identity conflict. Reload before choosing another image.')}item={...item,uploaded:true};setAttempt(item)}}
   const {error:saveError}=await supabase.rpc('set_solo_product_image',{p_operation:item.operation,p_request:{id:productId,expected_image_path:item.expected,image_path:item.path}})
   if(saveError)throw saveError
   setRevision(n=>n+1);setAttempt(undefined);setNotice(item.path?'Product image saved. Sync the field app to receive it.':'Product image removed.');onChanged()
  }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 }
 async function choose(file?:File){if(!file||!current||busy||attempt)return;setBusy(true);setError('');try{const blob=await normaliseProductImage(file),owner=await offlineOwner(db);const item={operation:crypto.randomUUID(),path:`${owner}/${productId}/${crypto.randomUUID()}.webp`,expected:current.path,blob};setBusy(false);await save(item)}catch(e){setError(e instanceof Error?e.message:String(e));setBusy(false)}}
 return <section className="admin-panel product-image-editor"><h2>Product image</h2><p className="admin-subtle">Used on the mobile catalogue. Choose JPEG, PNG or WebP up to 8 MB; the saved image is resized and optimized. Save the product first before adding its image.</p>{current&&<ProductImage key={current.path??'empty'} path={current.path} label={current.label}/>}{!current&&!error&&<p role="status">Loading image…</p>}<label>Upload / replace image<input type="file" accept="image/jpeg,image/png,image/webp" disabled={!current||busy||Boolean(attempt)} onChange={e=>{void choose(e.target.files?.[0]);e.target.value=''}}/></label>{current?.path&&<button disabled={busy||Boolean(attempt)} onClick={()=>void save({operation:crypto.randomUUID(),path:null,expected:current.path})}>Remove image</button>}{attempt&&<div><p role="status">An image update is pending. Retry the same update before choosing another.</p><button disabled={busy} onClick={()=>void save(attempt)}>Retry image update</button><button disabled={busy} onClick={()=>{setAttempt(undefined);setRevision(n=>n+1)}}>Reload image state</button></div>}{error&&<p className="error" role="alert">{error}</p>}{notice&&<p className="ok-text" role="status">{notice}</p>}</section>
}
