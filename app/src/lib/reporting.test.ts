import { describe, expect, it } from 'vitest'
import { baghdadDay, currentReport, type Balance } from './reporting'
const invoice = (id: string, total: string, collected: string, outstanding: string, overpayment = '0'): Balance => ({id,invoice_no:1,outlet_id:'client',total,collected,outstanding,overpayment,due_date:null,payment_status:'Unpaid'})
describe('USD reporting reconciliation', () => {
  it('counts adjusted invoices once, refunds and correction reversals once, and isolates overpayments', () => {
    const invoices = [invoice('a','90000','55000','35000'),invoice('b','80000','100000','0','20000'),invoice('c','100000','50000','50000')]
    const cash = [{id:'1',order_id:'a',amount:'60000'},{id:'2',order_id:'a',amount:'-5000'},{id:'3',order_id:'b',amount:'100000'},{id:'4',order_id:'c',amount:'60000'},{id:'5',order_id:'c',amount:'-60000'},{id:'6',order_id:'c',amount:'50000'}]
    const result = currentReport(invoices,cash,[],new Date('2026-11-20T00:00:00Z'))
    expect(result).toMatchObject({sales:'270000.00',netCash:'205000.00',outstanding:'85000.00',overpayment:'20000.00',discrepancy:'0.00'})
    expect(() => currentReport([...invoices,invoices[0]],cash,[],new Date())).toThrow('Duplicate')
  })
  it('does not hide offsetting invoice reconciliation errors', () => {
    const r = currentReport([invoice('a','20','10','10'),invoice('b','20','0','20')],[{id:'cash',order_id:'b',amount:'10'}],[],new Date())
    expect(r.discrepancy).toBe('20.00')
  })
  it('separates due reminders from overdue invoices, ignores settled balances, and uses Baghdad midnight', () => {
    const at = new Date('2026-11-19T21:00:00Z')
    expect(baghdadDay(at)).toBe('2026-11-20')
    expect(baghdadDay(new Date(at.getTime()-1))).toBe('2026-11-19')
    const invoices = [{...invoice('a','20','0','20'),due_date:'2026-11-20'}, {...invoice('b','30','0','30'),due_date:'2026-11-19'},invoice('c','40','40','0'),invoice('d','10','0','10')]
    const reminder = {order_id:'a',status:'pending',scheduled_at:at.toISOString()}
    const r = currentReport(invoices,[{id:'paid',order_id:'c',amount:'40'},{id:'unallocated',order_id:null,amount:'5'}],[reminder,reminder,{...reminder,order_id:'c'}],at)
    expect(r.due.map(row => row.invoice.id)).toEqual(['a'])
    expect(r).toMatchObject({overdue:'30.00',unknownAging:'10.00',outstanding:'60.00',unallocatedCash:'5.00',discrepancy:'0.00'})
  })
})
