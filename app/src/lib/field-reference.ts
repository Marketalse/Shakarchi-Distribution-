import type {LocalDb} from './db'
import type {SupabaseClient} from '@supabase/supabase-js'
/** Read-only field snapshots; no HTTP response cache for authenticated API traffic. */
export async function warmFieldHistory(db:LocalDb,owner:string,client:SupabaseClient){
 const tables:Record<string,string>={solo_invoice_balances:'id,invoice_no,outlet_id,total,collected,outstanding,overpayment,due_date,payment_status,created_at,recipient_snapshot',order_lines:'id,order_id,quantity,unit_price,line_total,product_snapshot',basic_invoice_totals:'id,outlet_id,next_visit,total,payment_status',survey_brands:'id,name,is_own,active',solo_competitor_catalog:'id,brand_id,product_line,flavour'}
 for(const [table,columns] of Object.entries(tables)){
  const rows:Record<string,unknown>[]=[]
  for(let offset=0;;offset+=500){const {data,error}=await client.from(table).select(columns).order('id').range(offset,offset+499);if(error)throw error;rows.push(...data as unknown as Record<string,unknown>[]);if(data.length<500)break}
  await db.local_meta.put({key:`field-table:${owner}:${table}`,value:JSON.stringify({at:new Date().toISOString(),rows})})
 }
 await db.local_meta.put({key:'offline-data-ready',value:new Date().toISOString()})
}
