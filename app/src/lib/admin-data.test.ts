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
