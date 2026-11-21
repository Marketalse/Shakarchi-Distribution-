import type { SupabaseClient } from '@supabase/supabase-js'
import { db } from './db'
import { sendCommand } from './commands'

/** Decimal strings preserve PostgreSQL numeric precision across the API boundary. */
export type Usd = string
export type Operation<T> = Readonly<{ id: string; request: T }>
export type IssueRequest = {
  currency: 'USD'
  outlet_id: string
  visit_id?: string
  terms_days: number
  next_visit?: string
  items: { sku_id: string; quantity: number; price: Usd }[]
  initial_amount: Usd
  method: 'cash' | 'transfer'
}
export type CollectionRequest = {
  currency: 'USD'
  settlement_currency?: 'USD' | 'IQD'
  source_amount?: string
  rate_version_id?: string
  order_id: string
  outlet_id: string
  kind: 'receipt' | 'refund' | 'correction'
  amount?: Usd
  method: 'cash' | 'transfer'
  receipt_id?: string
  reason?: string
}

/** Persist this operation before sending. Retry the same object after transport errors. */
export function operation<T>(request: T): Operation<T> {
  return { id: crypto.randomUUID(), request: structuredClone(request) }
}

export function soloApi(client: SupabaseClient) {
  async function call<T>(name: string, command: Operation<unknown>): Promise<T> {
    const { data: { session }, error: authError } = await client.auth.getSession()
    if (authError || !session) throw Error('Sign in before posting an operation.')
    return await sendCommand(db, session.user.id, name, command.id, command.request, async (rpc, id, request) => {
      if (rpc === 'update_solo_client' && await db.outbox.where('table').equals('outlets').filter(row => row.row_id === (request as {outlet_id?:string}).outlet_id).count()) throw Error('Client edit is saved locally. Sync the new client first.')
      const { data, error } = await client.rpc(rpc, { p_operation: id, p_request: request })
      if (error) throw Object.assign(new Error(error.message), { code: error.code })
      return data
    }) as T
  }
  return {
    updateClient: (command: Operation<Record<string, unknown>>) => call<{ outlet_id: string }>('update_solo_client', command),
    submitObservation: (command: Operation<Record<string, unknown>>) => call<{ observation_id: string }>('submit_solo_observation', command),
    correctLocation: (command: Operation<Record<string, unknown>>) => call<{ outlet_id: string }>('correct_solo_client_location', command),
    finishVisit: (command: Operation<{ visit_id: string; outcome?: string }>) => call<{ visit_id: string }>('finish_solo_visit', command),
    issueInvoice: (command: Operation<IssueRequest>) =>
      call<{ order_id: string; invoice_no: number }>('issue_solo_invoice', command),
    postCollection: (command: Operation<CollectionRequest>) =>
      call<{ order_id: string; entry_id: string | null }>('post_solo_collection', command),
    rescheduleReminder: (command: Operation<{ order_id: string; scheduled_at: string }>) =>
      call<{ order_id: string; scheduled_at: string }>('reschedule_solo_reminder', command),
    publishSurvey: (command: Operation<{
      title: string
      questions: { id: string; label: string; type: 'text' | 'number' | 'boolean' | 'choice'; required: boolean; options?: string[] }[]
    }>) => call<{ version_id: string }>('publish_solo_survey', command),
    submitSurvey: (command: Operation<{
      version_id: string; outlet_id: string; visit_id: string; brand_id: string; product_id?: string
      answers: Record<string, string | number | boolean>
    }>) => call<{ run_id: string }>('submit_solo_survey', command),
    publishRate: (command: Operation<{ exchange_rate_used: string; rate_source: string; valid_until: string }>) =>
      call<{ rate_version_id: string }>('publish_solo_fx_rate', command),
    updateProduct: (command: Operation<Record<string, unknown>>) =>
      call<{ product_id: string }>('update_solo_product', command),
    importData: (command: Operation<{
      currency?: 'USD'
      kind: 'brands' | 'products' | 'observations'; rows: Record<string, unknown>[]
    }>) => call<{ imported: number }>('import_solo_data', command),
  }
}
