import {productBounds,squareProductCrop} from './product-framing'
import type {SupabaseClient} from '@supabase/supabase-js'
import type {LocalDb} from './db'
import {offlineOwner} from './offline'
export const MAX_PRODUCT_IMAGE=524288
const uuid='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const pathPattern=new RegExp(`^(${uuid})/(${uuid})/(${uuid})\\.webp$`)
export function validProductImagePath(path:string,owner:string,product?:string){const match=path.match(pathPattern);return Boolean(match&&match[1]===owner&&(!product||match[2]===product))}
export function validateProductImage(file:Blob){if(file.type!=='image/webp'||file.size>MAX_PRODUCT_IMAGE||file.size===0)throw Error('Product images must be WebP up to 512 KB.')}
export async function validateProductImageBytes(file:Blob){validateProductImage(file);const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer());if(bytes.length<12||String.fromCharCode(...bytes.subarray(0,4))!=='RIFF'||String.fromCharCode(...bytes.subarray(8,12))!=='WEBP')throw Error('Image content is not a WebP raster image.')}
export async function normaliseProductImage(file:File,autoCrop=true):Promise<Blob>{
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8388608||!file.size)throw Error('Choose a JPEG, PNG or WebP image up to 8 MB.')
 const image=await createImageBitmap(file)
 try{
  if(image.width>12000||image.height>12000)throw Error('Choose an image with dimensions below 12,000 pixels.')
  const probe=document.createElement('canvas'),scale=Math.min(1,512/Math.max(image.width,image.height))
  probe.width=Math.max(1,Math.round(image.width*scale));probe.height=Math.max(1,Math.round(image.height*scale))
  const analysis=probe.getContext('2d',{willReadFrequently:true});if(!analysis)throw Error('Image preparation unavailable in this browser.')
  analysis.drawImage(image,0,0,probe.width,probe.height)
  const found=autoCrop?productBounds(probe.width,probe.height,analysis.getImageData(0,0,probe.width,probe.height).data):{x:0,y:0,width:probe.width,height:probe.height}
  const detected={x:found.x*image.width/probe.width,y:found.y*image.height/probe.height,width:found.width*image.width/probe.width,height:found.height*image.height/probe.height}
  const source=autoCrop?squareProductCrop(detected,image.width,image.height):detected
  const canvas=document.createElement('canvas'),outputScale=Math.min(1,768/Math.max(source.width,source.height));canvas.width=Math.max(1,Math.round(source.width*outputScale));canvas.height=Math.max(1,Math.round(source.height*outputScale))
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Image preparation unavailable in this browser.')
  ctx.drawImage(image,source.x,source.y,source.width,source.height,0,0,canvas.width,canvas.height)
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Could not prepare image.')),'image/webp',.85))
  await validateProductImageBytes(blob);return blob
 }finally{image.close()}
}
async function dataUrl(blob:Blob){const bytes=new Uint8Array(await blob.arrayBuffer());let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return 'data:image/webp;base64,'+btoa(text)}
export async function cachedProductImage(db:LocalDb,path:string){const owner=await offlineOwner(db);if(!validProductImagePath(path,owner))throw Error('Image reference belongs to another workspace.');const row=await db.local_meta.get('product-image:'+path);return row?.value.startsWith('data:image/webp;base64,')?row.value:undefined}
export async function downloadProductImage(db:LocalDb,client:SupabaseClient,path:string){const owner=await offlineOwner(db);if(!validProductImagePath(path,owner))throw Error('Invalid product image reference.');const {data,error}=await client.storage.from('product-images').download(path);if(error)throw error;await validateProductImageBytes(data);const src=await dataUrl(data);try{await db.local_meta.put({key:'product-image:'+path,value:src})}catch{/* Storage quota must not block ordering or online image display. */}return src}
