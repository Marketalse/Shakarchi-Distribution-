import type { SalesLine } from './catalog-report';
import type { SupabaseClient } from '@supabase/supabase-js';
import { baghdadDay, currentReport, type Balance, type CashEntry, type Reminder } from './reporting';
import { sumUsd, usdCents } from './money';
import type { Outlet } from './types';
export type AdminInvoice = Balance & {
  created_at: string;
};
export type AdminCash = CashEntry & {
  collected_at: string;
  entry_type: string;
  method: string;
  note?: string | null;
};
export type AdminProduct = {
  id: string;
  sku: string | null;
  brand: string | null;
  brand_id: string | null;
  product_line: string;
  flavour: string;
  active: boolean;
  is_own_brand: boolean;
  currency: string;
  selling_price: string | null;
};
export type AdminSurvey = {
  id: string;
  title: string;
  questions: {
    id: string;
    label: string;
    type: string;
    required: boolean;
  }[];
  created_at: string;
};
export type AdminRun = {
  id: string;
  version_id: string;
  outlet_id: string;
  created_at: string;
  answers: Record<string, unknown>;
};
export type AdminData = {
  clients: (Outlet & {
    archived_at?: string | null;
  })[];
  invoices: AdminInvoice[];
  cash: AdminCash[];
  reminders: Reminder[];
  products: AdminProduct[];
  surveys: AdminSurvey[];
  runs: AdminRun[];
  observations: {
    id: string;
    outlet_id: string;
    created_at: string;
    brand: string;
    kind: string;
    price: string | null;
  }[];
  invoiceLines?: SalesLine[];
  loadedAt: string;
};
export async function adminRows<T>(client: SupabaseClient, table: string, columns: string, key = 'id'): Promise<T[]> {
  const result: T[] = [];
  for (let offset = 0;; offset += 500) {
    const {
      data,
      error
    } = await client.from(table).select(columns).order(key).range(offset, offset + 499);
    if (error) throw Error(error.message);
    result.push(...(data as T[]));
    if (data.length < 500) return result;
  }
}
export async function loadAdminData(client: SupabaseClient): Promise<AdminData> {
  const [clients, invoices, cash, reminders, products, surveys, runs, observations] = await Promise.all([adminRows<AdminData['clients'][number]>(client, 'outlets', '*'), adminRows<AdminInvoice>(client, 'solo_invoice_balances', 'id,invoice_no,outlet_id,total,collected,outstanding,overpayment,due_date,payment_status,recipient_snapshot,created_at'), adminRows<AdminCash>(client, 'payments', 'id,order_id,amount,collected_at,entry_type,method,note'), adminRows<Reminder>(client, 'collection_reminders', 'order_id,status,scheduled_at', 'order_id'), adminRows<AdminProduct>(client, 'products', 'id,sku,brand,brand_id,product_line,flavour,active,is_own_brand,currency,selling_price'), adminRows<AdminSurvey>(client, 'survey_versions', 'id,title,questions,created_at'), adminRows<AdminRun>(client, 'survey_runs', 'id,version_id,outlet_id,created_at,answers'), adminRows<AdminData['observations'][number]>(client, 'market_observations', 'id,outlet_id,created_at,brand,kind,price')]);
  currentReport(invoices, cash, reminders, new Date());
  const invoiceLines=await adminRows<SalesLine>(client, 'order_lines', 'id,order_id,line_total,product_snapshot');
  return {
    invoiceLines,
    clients,
    invoices,
    cash,
    reminders,
    products,
    surveys,
    runs,
    observations,
    loadedAt: new Date().toISOString()
  };
}
export type AdminPeriod = 'today' | 'week' | 'month' | 'all';
const shiftDay = (day: string, offset: number) => new Date(Date.parse(day + 'T12:00:00Z') + offset * 86400000).toISOString().slice(0, 10);
export function adminSummary(data: Pick<AdminData, 'clients' | 'invoices' | 'cash' | 'reminders'>, period: AdminPeriod, at: Date) {
  const today = baghdadDay(at),
    start = period === 'today' ? today : period === 'week' ? shiftDay(today, -6) : period === 'month' ? today.slice(0, 7) + '-01' : undefined;
  const inPeriod = (value: string) => {
    const day = baghdadDay(new Date(value));
    return (!start || day >= start) && day <= today;
  };
  const invoices = data.invoices.filter(i => inPeriod(i.created_at)),
    cash = data.cash.filter(i => inPeriod(i.collected_at));
  const report = currentReport(data.invoices, data.cash, data.reminders, at);
  const chartStart = start ?? shiftDay(today, -29);
  const buckets = new Map<string, string[]>();
  for (let day = chartStart; day <= today; day = shiftDay(day, 1)) buckets.set(day, []);
  for (const i of data.invoices) buckets.get(baghdadDay(new Date(i.created_at)))?.push(String(i.total));
  return {
    sales: sumUsd(invoices.map(i => i.total)),
    cash: sumUsd(cash.map(i => i.amount)),
    invoiceCount: invoices.length,
    activeClients: data.clients.filter(c => !c.archived_at).length,
    report,
    allocated: sumUsd(data.invoices.map(i => i.collected)),
    invoiced: sumUsd(data.invoices.map(i => i.total)),
    chart: [...buckets].map(([day, values]) => ({
      day,
      total: sumUsd(values)
    })),
    start,
    today
  };
}
export function percentOf(value: string, total: string) {
  const denominator = usdCents(total),
    numerator = usdCents(value);
  if (denominator <= 0n || numerator <= 0n) return 0;
  return Number((numerator >= denominator ? denominator : numerator) * 10000n / denominator) / 100;
}
export const adminInvoiceLabel = (invoice: Pick<AdminInvoice, 'invoice_no'>) => 'INV-' + String(invoice.invoice_no).padStart(4, '0');
export function formatAdminDate(value?: string | null) {
  if (!value) return 'Date unavailable';
  const at = new Date(value);
  return Number.isFinite(at.getTime()) ? new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Baghdad',
    dateStyle: 'medium'
  }).format(at) : 'Date unavailable';
}
