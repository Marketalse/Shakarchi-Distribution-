import {formatUsd} from './money'
import {invoiceItem,invoiceQuantity,invoiceSellingPrice,invoiceUnit,type ProductSnapshot} from './invoice-display'
export type PdfInvoice={id:string;invoice_no:number;total:string;collected:string;outstanding:string;payment_status:string;created_at:string;recipient_snapshot:{name?:string}|null}
export type PdfLine={id:string;quantity:number;unit_price:string;line_total:string;product_snapshot:ProductSnapshot|null}
/** Canvas text uses the browser's Unicode/Arabic shaping; PDFs contain raster pages, not selectable text. */
export async function invoicePdf(invoice:PdfInvoice,lines:PdfLine[]):Promise<File>{
 if(!lines.length)throw Error('Invoice items are not ready. Sync and retry.')
 const {jsPDF}=await import('jspdf')
 if(document.fonts)await document.fonts.ready
 const pdf=new jsPDF({format:'a4',unit:'mm',compress:true}),canvas=document.createElement('canvas');canvas.width=1240;canvas.height=1754
 const ctx=canvas.getContext('2d')!;if(!ctx)throw Error('PDF rendering is unavailable.')
 const family='"Readex Pro", Arial, sans-serif';let y=0,pages=0
 const text=(value:string,x:number,row:number,width:number,size=24,bold=false)=>{ctx.font=`${bold?'600':'400'} ${size}px ${family}`;ctx.fillStyle='#1d2a44';const rtl=/[\u0600-\u06ff]/.test(value);ctx.direction=rtl?'rtl':'ltr';ctx.textAlign=rtl?'right':'left';ctx.fillText(value,rtl?x+width:x,row)}
 const wrap=(value:string,width:number,size=24)=>{ctx.font=`400 ${size}px ${family}`;const result:string[]=[];let line='';for(const token of value.split(/\s+/)){const next=line?line+' '+token:token;if(ctx.measureText(next).width<=width){line=next;continue}if(line){result.push(line);line=''}let part='';for(const char of token){if(part&&ctx.measureText(part+char).width>width){result.push(part);part=char}else part+=char}line=part}if(line)result.push(line);return result}
 function start(){ctx.fillStyle='white';ctx.fillRect(0,0,1240,1754);text('Shakarchi Distribution',60,78,1100,32,true);text(`Invoice #${invoice.invoice_no}`,60,126,1100,30,true);text(invoice.payment_status,60,167,1100,24);text(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Baghdad',dateStyle:'medium'}).format(new Date(invoice.created_at)),60,206,1100,22);y=250;for(const name of wrap(invoice.recipient_snapshot?.name||'Client name unavailable',1100,28)){text(name,60,y,1100,28,true);y+=38}y+=28;text('Item / brand / type / unit price',60,y,650,22,true);text('Quantity',740,y,200,22,true);text('Total · USD',980,y,200,22,true);y+=42}
 function finish(){text(`Page ${pages+1} · USD · Payment status from latest available data`,60,1716,1100,19);if(pages)pdf.addPage();pdf.addImage(canvas.toDataURL('image/jpeg',.94),'JPEG',0,0,210,297,undefined,'FAST');pages++}
 const ensure=(height:number)=>{if(y+height>1640){finish();start()}}
 start()
 for(const line of lines){const item=invoiceItem(line.product_snapshot);const detail=[item.name,item.brand,item.mode,formatUsd(invoiceSellingPrice(line.product_snapshot,line.unit_price))+invoiceUnit(line.product_snapshot)].join(' · '),description=wrap(detail,640),quantity=wrap(invoiceQuantity(line.product_snapshot,line.quantity),200,22);const count=Math.max(description.length,quantity.length)
  if(count*36+22<1200)ensure(count*36+22)
  for(let i=0;i<count;i++){ensure(36);if(description[i])text(description[i],60,y,640);if(quantity[i])text(quantity[i],740,y,200,22);if(i===0)text(formatUsd(line.line_total),980,y,200,22,true);y+=36}
  y+=22
 }
 ensure(190);y+=20
 for(const [label,amount]of [['Total',invoice.total],['Collected',invoice.collected],['Balance',invoice.outstanding]]){text(label,60,y,800,26,true);text(formatUsd(amount),960,y,230,26,true);y+=45}
 ensure(75);text('This invoice is not proof of payment for any unpaid balance.',60,y+25,1100,20)
 finish();return new File([pdf.output('blob')],`Invoice-${String(invoice.invoice_no).replace(/[^0-9A-Za-z-]/g,'')}.pdf`,{type:'application/pdf'})
}
