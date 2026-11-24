import type {LocalDb} from './db'
import type {SupabaseClient} from '@supabase/supabase-js'
export type FieldProduct={image_path?:string|null;id:string;brand:string|null;sku:string|null;product_line:string;flavour:string;selling_price:number;items_per_half_pack:number;packs_per_box:number}
export async function fieldCatalog(db:LocalDb,client:SupabaseClient|null):Promise<FieldProduct[]>{
 const ready=await db.local_meta.get('catalog-ready')
 if(ready){const cached=await db.products.toArray();if(cached.every(p=>p.selling_price!=null&&p.items_per_half_pack&&p.packs_per_box))return cached as unknown as FieldProduct[]}
 if(!client || !navigator.onLine)throw Error('Sync the catalog online once before taking offline orders.')
 const rows:FieldProduct[]=[]
 for(let offset=0;;offset+=500){const {data,error}=await client.from('solo_order_catalog_v2').select('*').order('id').range(offset,offset+499);if(error)throw error;rows.push(...data as FieldProduct[]);if(data.length<500)break}
 await db.transaction('rw',[db.products,db.local_meta],async()=>{await db.products.clear();await db.products.bulkPut(rows.map(r=>({...r,active:true,currency:'USD'})));await db.local_meta.put({key:'catalog-ready',value:new Date().toISOString()})})
 return rows
}
