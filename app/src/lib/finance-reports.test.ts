import {describe,it,expect} from 'vitest'
import {invoiceGrossProfit,receivablesAging,type ProfitLine} from './finance-reports'
import type {Balance} from './reporting'
const at=new Date('2026-11-22T12:00:00Z')
const invoice=(id='i',total='100.00')=>({id,invoice_no:1,outlet_id:'client',total,collected:'0.00',outstanding:total,overpayment:'0.00',due_date:'2026-11-22',payment_status:'Unpaid',created_at:'2026-11-22T00:00:00Z'})
const line=(change:Partial<ProfitLine>={}):ProfitLine=>({id:'l',order_id:'i',product_id:'sku',kind:'sale',quantity:10,unit_price:'10.00',unit_cost:'6.00',line_total:'100.00',product_snapshot:{brand:'Frozen brand',product_line:'Frozen line',flavour:'Plain item',currency:'USD'},...change})

describe('current customer aging',()=>{
 it('partitions all boundaries exactly without netting overpayments or treating missing due dates as current',()=>{
  const days=['2026-11-23','2026-11-22','2026-11-21','2026-10-23','2026-10-22','2026-09-23','2026-09-22','2026-08-24','2026-08-23',null]
  const rows:Balance[]=days.map((due_date,index)=>({...invoice(String(index),'0.01'),due_date}))
  rows.push({...invoice('paid','0.00'),overpayment:'100.00'})
  const r=receivablesAging(rows,at)
  expect(r.buckets.map(b=>b.count)).toEqual([2,2,2,2,1,1])
  expect(r.buckets.map(b=>b.amount)).toEqual(['0.02','0.02','0.02','0.02','0.01','0.01'])
  expect(r.total).toBe('0.10');expect(r.rows).toHaveLength(10)
 })
 it('moves due-today debt into overdue at Baghdad midnight, independently of UTC midnight',()=>{
  const rows=[{...invoice(),due_date:'2026-11-21'}]
  expect(receivablesAging(rows,new Date('2026-11-21T20:59:59Z')).buckets[0].amount).toBe('100.00')
  expect(receivablesAging(rows,new Date('2026-11-21T21:00:00Z')).buckets[1].amount).toBe('100.00')
 })
 it('fails closed for duplicate identities, invalid calendar dates and negative outstanding',()=>{
  expect(()=>receivablesAging([invoice(),invoice()],at)).toThrow('Duplicate')
  expect(()=>receivablesAging([{...invoice(),due_date:'2026-02-30'}],at)).toThrow('Invalid')
  expect(()=>receivablesAging([{...invoice(),outstanding:'-1.00'}],at)).toThrow('Negative')
  expect(receivablesAging([],at).total).toBe('0.00')
 })
})
describe('invoice-cohort gross profit',()=>{
 it('uses frozen line cost, exact cents and the same sales cohort for product/client totals',()=>{
  const r=invoiceGrossProfit([invoice()],[line()],'today',at)
  expect(r.total).toMatchObject({sales:'100.00',cost:'60.00',profit:'40.00',margin:'40.00',complete:true})
  expect(r.groups[0]).toMatchObject({brand:'Frozen brand',line:'Frozen line',label:'Plain item'})
  expect(r.clients[0]).toMatchObject({id:'client',sales:'100.00',profit:'40.00'})
 })
 it('uses stored half-pack quantities without multiplying packaging again; excludes earlier and future cohorts',()=>{
  const i=invoice('i','96.00'),l=line({quantity:3,unit_price:'32.00',unit_cost:'18.00',line_total:'96.00'})
  const r=invoiceGrossProfit([i,{...invoice('old'),created_at:'2026-11-21T20:59:59Z'},{...invoice('future'),created_at:'2026-11-22T21:00:00Z'}],[l],'today',at)
  expect(r.total).toMatchObject({sales:'96.00',cost:'54.00',profit:'42.00',margin:'43.75'})
 })
 it('withholds complete profit for missing historical cost or unproven currency but accepts explicit zero cost',()=>{
  for(const change of [{unit_cost:null},{product_snapshot:null},{product_snapshot:{brand:'Legacy'}}]){
   expect(invoiceGrossProfit([invoice()],[line(change)],'all',at).total).toMatchObject({cost:null,profit:null,margin:null,missing:1})
  }
  expect(invoiceGrossProfit([invoice()],[line({unit_cost:'0.00'})],'all',at).total.profit).toBe('100.00')
 })
 it('does not infer return cost reversals; unrelated receipts/refunds do not affect an invoice sales cohort',()=>{
  const returned=invoiceGrossProfit([invoice('i','-10.00')],[line({kind:'return',quantity:1,line_total:'-10.00'})],'all',at)
  expect(returned.total).toMatchObject({sales:'-10.00',cost:null,profit:null,returns:1})
  const paid={...invoice(),collected:'55.00',outstanding:'45.00'}
  expect(invoiceGrossProfit([paid],[line()],'all',at).total.profit).toBe('40.00')
 })
 it('keeps known product results scoped while withholding the incomplete combined total',()=>{
  const r=invoiceGrossProfit([invoice('i','200.00')],[line(),line({id:'unknown',product_id:'other',unit_cost:null})],'all',at)
  expect(r.total.profit).toBeNull();expect(r.groups.map(g=>g.value.profit)).toEqual(['40.00',null])
 })
 it('shows negative profit and undefined zero-revenue margin honestly',()=>{
  expect(invoiceGrossProfit([invoice()],[line({unit_cost:'12.00'})],'all',at).total).toMatchObject({profit:'-20.00',margin:'-20.00'})
  expect(invoiceGrossProfit([invoice('i','0.00')],[line({unit_price:'0.00',line_total:'0.00'})],'all',at).total).toMatchObject({profit:'-60.00',margin:null})
  expect(invoiceGrossProfit([],[],'all',at).total.profit).toBeNull()
 })
 it('rejects offsetting per-invoice errors, duplicate rows, missing lines and invalid line math',()=>{
  expect(()=>invoiceGrossProfit([invoice(),invoice('b')],[line({quantity:9,line_total:'90.00'}),line({id:'b',order_id:'b',quantity:11,line_total:'110.00'})],'all',at)).toThrow('per invoice')
  expect(()=>invoiceGrossProfit([invoice()],[line(),line()],'all',at)).toThrow('Duplicate')
  expect(()=>invoiceGrossProfit([invoice()],[],'all',at)).toThrow('per invoice')
  expect(()=>invoiceGrossProfit([invoice()],[line({quantity:0.5})],'all',at)).toThrow('quantity')
  expect(()=>invoiceGrossProfit([invoice()],[line({unit_price:'9.00'})],'all',at)).toThrow('price')
  expect(()=>invoiceGrossProfit([invoice()],[line({unit_cost:'-1.00'})],'all',at)).toThrow('cost')
  expect(()=>invoiceGrossProfit([invoice()],undefined,'all',at)).toThrow('unavailable')
 })
})
