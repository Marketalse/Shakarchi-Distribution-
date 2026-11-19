// Row shapes mirror supabase/migrations/001_initial_schema.sql.
// Every id is created on the phone so a row can be saved offline
// and uploaded later without creating a duplicate.

export type Relationship = 'customer' | 'prospect'
export type VisitOutcome =
  | 'order_taken'
  | 'survey_only'
  | 'collection_only'
  | 'shop_closed'
  | 'refused'
export type PaymentType = 'cash' | 'credit'
export type LineKind = 'sale' | 'return'
export type PaymentMethod = 'cash' | 'transfer'

export interface Outlet {
  id: string
  retail_name: string
  owner_name?: string
  staff_name?: string
  staff_phone?: string
  owner_phone?: string
  shop_phone?: string
  lat: number
  lng: number
  address?: string
  province: string
  area: string
  outlet_type: string
  relationship: Relationship
  credit_limit: number
  payment_terms_days: number
  assigned_rep: string
  updated_at: string
}

export interface Product {
  id: string
  product_line: string
  flavour: string
  wholesale_price: number
  currency: string
  active: boolean
}

export interface SurveyBrand {
  id: string
  name: string
  is_own: boolean
  active: boolean
}

export interface Visit {
  id: string
  outlet_id: string
  rep_id: string
  checked_in_at: string
  checked_out_at?: string
  lat?: number
  lng?: number
  outcome: VisitOutcome
  note?: string
}

export interface SurveyAnswer {
  id: string
  visit_id: string
  brand_id: string
  present: boolean
  facings?: number
  shelf_price?: number
  out_of_stock?: boolean
  est_weekly_sales?: number
}

export interface Order {
  id: string
  visit_id: string
  outlet_id: string
  rep_id: string
  payment_type: PaymentType
  due_date?: string
}

export interface OrderLine {
  id: string
  order_id: string
  product_id: string
  kind: LineKind
  quantity: number
  unit_price: number
}

export interface Payment {
  id: string
  outlet_id: string
  visit_id?: string
  order_id?: string
  amount: number
  method: PaymentMethod
  note?: string
  collected_by: string
  collected_at: string
}

/** Tables the phone uploads, in the order the database needs them. */
export const UPLOAD_ORDER = [
  'outlets',
  'visits',
  'survey_answers',
  'orders',
  'order_lines',
  'payments',
] as const
export type UploadTable = (typeof UPLOAD_ORDER)[number]

export interface OutboxItem {
  /** Auto-incremented local sequence number. */
  seq?: number
  table: UploadTable
  row_id: string
  payload: Record<string, unknown>
  queued_at: string
  attempts: number
  last_error?: string
}
