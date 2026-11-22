import { describe, it, expect } from 'vitest';
import { adminSummary, percentOf, adminRows, formatAdminDate, type AdminData } from './admin-data';
import type { SupabaseClient } from '@supabase/supabase-js';
const data: AdminData = {
  clients: [],
  invoices: [],
  cash: [],
  reminders: [],
  products: [],
  surveys: [],
  runs: [],
  observations: [],
  loadedAt: ''
};
describe('admin reporting contracts', () => {
  it('uses Baghdad calendar days and separates period cash from current debt', () => {
    const invoices = [{
      id: 'i',
      invoice_no: 1,
      outlet_id: 'c',
      total: '10.10',
      collected: '0.10',
      outstanding: '10.00',
      overpayment: '0.00',
      due_date: '2026-11-01',
      payment_status: 'Partially paid',
      created_at: '2026-10-31T22:00:00Z'
    }];
    const cash = [{
      id: 'p',
      order_id: 'i',
      amount: '0.10',
      collected_at: '2026-11-20T22:00:00Z',
      entry_type: 'receipt',
      method: 'cash'
    }];
    const summary = adminSummary({
      ...data,
      invoices,
      cash
    }, 'week', new Date('2026-11-21T10:00:00Z'));
    expect(summary.sales).toBe('0.00');
    expect(summary.cash).toBe('0.10');
    expect(summary.report.outstanding).toBe('10.00');
    expect(summary.chart).toHaveLength(7);
    expect(adminSummary({
      ...data,
      invoices,
      cash
    }, 'month', new Date('2026-11-21T10:00:00Z')).sales).toBe('10.10');
  });
  it('does not hide duplicate financial rows or round large values through floats', () => {
    expect(percentOf('90071992547409.91', '90071992547409.91')).toBe(100);
    expect(percentOf('-1.00', '10.00')).toBe(0);
    expect(percentOf('1.00', '0.00')).toBe(0);
    const cash = {
      id: 'p',
      order_id: null,
      amount: '0.10',
      collected_at: '2026-11-21',
      entry_type: 'receipt',
      method: 'cash'
    };
    expect(() => adminSummary({
      ...data,
      cash: [cash, cash]
    }, 'all', new Date('2026-11-21'))).toThrow('Duplicate');
  });
  it('paginates beyond the default limit and propagates errors', async () => {
    const source = Array.from({
        length: 1001
      }, (_, id) => ({
        id
      })),
      ranges: number[] = [];
    const client = {
      from: () => ({
        select: () => ({
          order: () => ({
            range: async (start: number, end: number) => {
              ranges.push(start);
              return {
                data: source.slice(start, end + 1),
                error: null
              };
            }
          })
        })
      })
    } as unknown as SupabaseClient;
    expect(await adminRows(client, 'example', 'id')).toHaveLength(1001);
    expect(ranges).toEqual([0, 500, 1000]);
    const failing = {
      from: () => ({
        select: () => ({
          order: () => ({
            range: async () => ({
              data: null,
              error: {
                message: 'Denied'
              }
            })
          })
        })
      })
    } as unknown as SupabaseClient;
    await expect(adminRows(failing, 'example', 'id')).rejects.toThrow('Denied');
  });
});
it('renders missing timestamps honestly instead of crashing a view', () => {
  expect(formatAdminDate(null)).toBe('Date unavailable');
  expect(formatAdminDate('invalid')).toBe('Date unavailable');
  expect(formatAdminDate('2026-11-20T22:00:00Z')).toBe('21 Nov 2026');
});

it('today uses the Baghdad boundary, excludes future invoices and keeps prior debt visible', () => {
  const invoice = { id: 'past', invoice_no: 1, outlet_id: 'c', total: '2.25', collected: '0.00', outstanding: '2.25', overpayment: '0.00', due_date: null, payment_status: 'Unpaid', created_at: '2026-11-20T20:59:59Z' };
  const summary = adminSummary({ ...data, invoices: [invoice, { ...invoice, id: 'today', invoice_no: 2, total: '3.35', outstanding: '3.35', created_at: '2026-11-20T21:00:00Z' }, { ...invoice, id: 'future', invoice_no: 3, created_at: '2026-11-21T21:00:00Z' }] }, 'today', new Date('2026-11-21T10:00:00Z'));
  expect(summary.sales).toBe('3.35');
  expect(summary.chart).toEqual([{day:'2026-11-21',total:'3.35'}]);
  expect(summary.report.outstanding).toBe('7.85');
});

it('binds acknowledged field sources into the separate dashboard loader and does not fetch phone-only queues',async()=>{
 const {loadAdminData}=await import('./admin-data');const tables:string[]=[]
 const rows:Record<string,unknown[]>={outlets:[{id:'client',retail_name:'Test client'}],visits:[{id:'visit',outlet_id:'client',checked_in_at:'2026-11-22T00:00:00Z',checked_out_at:null}],survey_runs:[{id:'run',outlet_id:'client',version_id:'version',answers:{zero:0,no:false},created_at:'2026-11-22T00:00:00Z'}]}
 const client={from:(table:string)=>{tables.push(table);return {select:()=>({order:()=>({range:async()=>({data:rows[table]??[],error:null})})})}}} as unknown as SupabaseClient
 const data=await loadAdminData(client);expect(data.visits).toHaveLength(1);expect(data.runs[0].answers).toEqual({zero:0,no:false});expect(tables).toContain('visits');expect(tables).toContain('order_lines');expect(tables).not.toContain('capture_drafts');expect(tables).not.toContain('commands')
})

it('separates today cash reversals/refunds from the original invoice cohort without inflating sales',()=>{
 const invoices=[{id:'invoice',invoice_no:1,outlet_id:'client',total:'100.00',collected:'45.00',outstanding:'55.00',overpayment:'0.00',due_date:'2026-11-21',payment_status:'Partially paid',created_at:'2026-11-21T00:00:00Z'}]
 const cash=[{id:'receipt',amount:'60.00',collected_at:'2026-11-21T00:00:00Z',entry_type:'receipt'},{id:'reversal',amount:'-60.00',collected_at:'2026-11-22T00:00:00Z',entry_type:'correction_reversal'},{id:'replacement',amount:'50.00',collected_at:'2026-11-22T00:00:01Z',entry_type:'receipt'},{id:'refund',amount:'-5.00',collected_at:'2026-11-22T00:00:02Z',entry_type:'refund'}].map(p=>({...p,order_id:'invoice',method:'cash'}))
 const at=new Date('2026-11-22T12:00:00Z'),source={...data,invoices,cash}
 const today=adminSummary(source,'today',at),all=adminSummary(source,'all',at)
 expect(today.sales).toBe('0.00');expect(today.cash).toBe('-15.00');expect(all.sales).toBe('100.00');expect(all.cash).toBe('45.00');expect(all.report.outstanding).toBe('55.00');expect(all.report.discrepancy).toBe('0.00')
})
