import {describe,it,expect} from 'vitest'
import {invoiceItem,clientDebt} from './invoice-display'
import {baghdadDay} from './reporting'

describe('customer invoice presentation and debt',()=>{
 it('uses the stored variant rather than a tracking SKU and separates model/brand',()=>{
  expect(invoiceItem({flavour:'Blueberry Razz',brand:'Example',product_line:'Example MTL',sku:'INTERNAL-HASH-ABC123'})).toEqual({name:'Blueberry Razz',brand:'Example',mode:'MTL'})
  expect(invoiceItem({flavour:'Coffee',product_line:'Pantry'}).mode).toBe('Pantry')
  expect(invoiceItem({sku:'PRIVATE-ID'}).name).toBe('Item details unavailable')
  expect(invoiceItem(null).name).toBe('Item details unavailable')
 })
 it('does not mislabel not-yet-due or unaged balances as overdue or net off another invoice',()=>{
  const row={id:'a',invoice_no:1,outlet_id:'client',due_date:'2026-11-20',outstanding:'10.25'}
  const debt=clientDebt([row,{...row,id:'b',due_date:'2026-11-21',outstanding:'2.05'},{...row,id:'c',due_date:null,outstanding:'1.10'},{...row,id:'d',outstanding:'0.00'},{...row,id:'e',outlet_id:'other',outstanding:'99.00'}],'client','2026-11-21')
  expect(debt.overdue).toBe('10.25');expect(debt.outstanding).toBe('13.40');expect(debt.unknown).toBe(1);expect(debt.invoices.map(row=>row.id)).toEqual(['a'])
 })
 it('flags duplicate invoices instead of doubling customer debt',()=>{const row={id:'a',invoice_no:1,outlet_id:'client',due_date:'2026-11-20',outstanding:'0.10'};expect(()=>clientDebt([row,row],'client','2026-11-21')).toThrow('Duplicate invoice')})
 it('moves a due-today invoice to overdue at Baghdad midnight, not UTC midnight',()=>{
  const invoice={id:'a',invoice_no:1,outlet_id:'client',due_date:'2026-11-20',outstanding:'0.10'}
  expect(clientDebt([invoice],'client',baghdadDay(new Date('2026-11-20T20:59:59Z'))).overdue).toBe('0.00')
  expect(clientDebt([invoice],'client',baghdadDay(new Date('2026-11-20T21:00:00Z'))).overdue).toBe('0.10')
 })
})

it('renders declared Pack quantities and matching selling prices without rescaling legacy history',async()=>{
 const {invoiceQuantity,invoiceSellingPrice}=await import('./invoice-display');const snapshot={contract_version:2,base_uom:'half_pack'};
 expect(invoiceQuantity(snapshot,3)).toBe('1.5 Packs');expect(invoiceSellingPrice(snapshot,'9.95')).toBe('19.90');expect(invoiceSellingPrice(null,'9.95')).toBe('9.95');expect(invoiceQuantity(null,3)).toBe('3 (legacy unit)');
})
