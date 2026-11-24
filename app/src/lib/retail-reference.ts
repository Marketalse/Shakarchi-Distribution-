export type RetailIdentity={id?:unknown;retail_name?:unknown;area?:unknown;province?:unknown}
export type RetailReference={name:string;detail?:string}
type InvoiceIdentity={id?:unknown;outlet_id?:unknown;recipient_snapshot?:unknown}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const clean=(value:unknown)=>typeof value==='string'&&!uuid.test(value.trim())?value.trim():''
const comparable=(value:unknown)=>clean(value).normalize('NFKC').toLocaleLowerCase()
/** Display identity only. Never a foreign key, ledger reference, or invoice snapshot rewrite. */
export function retailReference(outletId:unknown,retails:readonly RetailIdentity[],fallbackName?:unknown):RetailReference{
 const retail=typeof outletId==='string'?retails.find(r=>r.id===outletId):undefined
 const name=clean(retail?.retail_name)||clean(fallbackName)||'Retail unavailable'
 const duplicate=retail&&retails.some(r=>r.id!==retail.id&&comparable(r.retail_name)===comparable(retail.retail_name))
 const detail=duplicate?[clean(retail.area),clean(retail.province)].filter(Boolean).join(' · ')||'Same-name retail · check record details':undefined
 return {name,detail}
}
export function invoiceRetailReference(invoice:InvoiceIdentity,retails:readonly RetailIdentity[]){
 const snapshot=invoice.recipient_snapshot
 const name=snapshot&&typeof snapshot==='object'&&'name'in snapshot?snapshot.name:undefined
 return retailReference(invoice.outlet_id,retails,name)
}
export function paymentRetailReference(payment:{order_id?:unknown;outlet_id?:unknown},invoices:readonly InvoiceIdentity[],retails:readonly RetailIdentity[]):RetailReference{
 const invoice=typeof payment.order_id==='string'?invoices.find(i=>i.id===payment.order_id):undefined
 if(invoice&&payment.outlet_id&&payment.outlet_id!==invoice.outlet_id)return {name:'Retail reference needs review',detail:'Payment and invoice retail differ'}
 return invoice?invoiceRetailReference(invoice,retails):retailReference(payment.outlet_id,retails)
}
export const retailReferenceText=(ref:RetailReference)=>ref.name+(ref.detail?' · '+ref.detail:'')
