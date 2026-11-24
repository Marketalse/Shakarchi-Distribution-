import {useEffect,useState} from 'react'
import {db} from '../lib/db'
import {supabase} from '../lib/supabase'
import {fieldTable,offlineOwner} from '../lib/offline'
import {invoicePdf,type PdfInvoice,type PdfLine} from '../lib/invoice-pdf'
export function InvoicePdfActions({invoiceId}:{invoiceId:string}){
 const [revision,setRevision]=useState(0),[state,setState]=useState<{id:string;file?:File;url?:string;error?:string}>({id:invoiceId})
 useEffect(()=>{let active=true,url:string|undefined
  void(async()=>{await offlineOwner(db);let invoice:PdfInvoice|undefined,lines:PdfLine[]=[]
   if(navigator.onLine&&supabase){const result=await supabase.from('solo_invoice_balances').select('id,invoice_no,total,collected,outstanding,payment_status,created_at,recipient_snapshot').eq('id',invoiceId).single();if(result.error)throw result.error;invoice=result.data;for(let offset=0;;offset+=500){const page=await supabase.from('order_lines').select('id,quantity,unit_price,line_total,product_snapshot').eq('order_id',invoiceId).order('id').range(offset,offset+499);if(page.error)throw page.error;lines.push(...page.data);if(page.data.length<500)break}}
   else{invoice=(await fieldTable<PdfInvoice>(db,'solo_invoice_balances'))?.find(i=>i.id===invoiceId);lines=(await fieldTable<PdfLine&{order_id:string}>(db,'order_lines'))?.filter(l=>l.order_id===invoiceId)??[]}
   if(!invoice)throw Error('Sync this invoice online before preparing its PDF.')
   const file=await invoicePdf(invoice,lines);if(!active)return;url=URL.createObjectURL(file);setState({id:invoiceId,file,url})
  })().catch(e=>{if(active)setState({id:invoiceId,error:e.message||String(e)})})
  return()=>{active=false;if(url)URL.revokeObjectURL(url)}
 },[invoiceId,revision])
 const current=state.id===invoiceId?state:undefined
 async function share(){if(!current?.file)return;try{await navigator.share({files:[current.file],title:current.file.name})}catch(e){if(e instanceof Error&&e.name!=='AbortError')setState(previous=>({...previous,error:'Sharing unavailable. Use Download PDF.'}))}}
 return <div className="invoice-pdf-actions">{current?.file?<>{navigator.canShare?.({files:[current.file]})&&<button type="button" className="primary" onClick={()=>void share()}>Share PDF</button>}<a className="button" href={current.url} download={current.file.name}>Download PDF</a></>:!current?.error&&<p role="status">Preparing invoice PDF…</p>}{current?.error&&<><p role="alert">{current.error}</p><button type="button" onClick={()=>{setState({id:invoiceId});setRevision(n=>n+1)}}>Retry PDF</button></>}</div>
}
