import 'fake-indexeddb/auto'
import{afterEach,describe,it,expect,vi}from'vitest'
import type{SupabaseClient}from'@supabase/supabase-js'
import{LocalDb}from'./db'
import{bindWorkspaceOwner}from'./capture-store'
import{validProductImagePath,validateProductImage,validateProductImageBytes,normaliseProductImage,cachedProductImage,downloadProductImage}from'./product-images'
const owner='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',product='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',version='cccccccc-cccc-cccc-cccc-cccccccccccc'
const path=`${owner}/${product}/${version}.webp`;const dbs:LocalDb[]=[]
afterEach(async()=>{for(const db of dbs.splice(0))await db.delete()})
async function setup(){const db=new LocalDb('product-media-'+crypto.randomUUID());dbs.push(db);await bindWorkspaceOwner(db,owner);return db}
const image=()=>new Blob(['RIFF0000WEBPfixture'],{type:'image/webp'})
describe('private product media',()=>{
 it('accepts only immutable paths scoped to this owner and product',()=>{expect(validProductImagePath(path,owner,product)).toBe(true);for(const bad of ['https://example.com/image.webp',`${owner}/../image.webp`,`${owner}/${product}/image.svg`])expect(validProductImagePath(bad,owner,product)).toBe(false);expect(validProductImagePath(path,product)).toBe(false);expect(validProductImagePath(path,owner,version)).toBe(false)})
 it('rejects oversized, empty, non-WebP and disguised content',async()=>{expect(()=>validateProductImage(new Blob([],{type:'image/webp'}))).toThrow();expect(()=>validateProductImage(new Blob([new Uint8Array(524289)],{type:'image/webp'}))).toThrow();expect(()=>validateProductImage(new Blob(['svg'],{type:'image/svg+xml'}))).toThrow();await expect(validateProductImageBytes(new Blob(['<svg>not-webp'],{type:'image/webp'}))).rejects.toThrow('WebP raster')})
 it('rejects unsupported raw uploads before attempting browser decoding',async()=>{await expect(normaliseProductImage(new File(['svg'],'unsafe.svg',{type:'image/svg+xml'}))).rejects.toThrow('Choose a JPEG')})
 it('downloads once into owner-bound cache without creating business commands',async()=>{const db=await setup();const download=vi.fn(async()=>({data:image(),error:null}));const client={storage:{from:()=>({download})}}as unknown as SupabaseClient;const src=await downloadProductImage(db,client,path);expect(src.startsWith('data:image/webp;base64,')).toBe(true);expect(await cachedProductImage(db,path)).toBe(src);expect(download).toHaveBeenCalledWith(path);expect(await db.commands.count()).toBe(0)})
 it('does not return cached data across owner bindings',async()=>{const db=await setup();await db.local_meta.put({key:'product-image:'+path,value:'data:image/webp;base64,fixture'});await db.local_meta.put({key:'workspace-owner',value:product});await expect(cachedProductImage(db,path)).rejects.toThrow('another workspace')})
 it('fails safely on missing storage data and never invents an image',async()=>{const db=await setup();const client={storage:{from:()=>({download:async()=>({data:null,error:Error('Not found')})})}}as unknown as SupabaseClient;await expect(downloadProductImage(db,client,path)).rejects.toThrow('Not found');expect(await cachedProductImage(db,path)).toBeUndefined()})
})
