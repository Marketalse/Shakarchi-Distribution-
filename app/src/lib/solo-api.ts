import type { SupabaseClient } from '@supabase/supabase-js'

/** Decimal strings preserve PostgreSQL numeric precision across the API boundary. */
export type Iqd = string
export type Operation<T> = Readonly<{ id: string; request: T }>
export type IssueRequest = {
  outlet_id: string
  visit_id?: string
  terms_days: number
  next_visit?: string
  items: { sku_id: string; quantity: number; price: Iqd }[]
  initial_amount: Iqd
  method: 'cash' | 'transfer'
}
export type CollectionRequest = {
  order_id: string
  outlet_id: string
  kind: 'receipt' | 'refund' | 'correction'
  amount: Iqd
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
    const { data, error } = await client.rpc(name, {
      p_operation: command.id,
      p_request: command.request,
    })
    if (error) throw Object.assign(new Error(error.message), { code: error.code })
    return data as T
  }
  return {
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
      version_id: string; outlet_id: string; visit_id: string
      answers: Record<string, string | number | boolean>
    }>) => call<{ run_id: string }>('submit_solo_survey', command),
    importData: (command: Operation<{
      kind: 'brands' | 'products' | 'observations'; rows: Record<string, unknown>[]
    }>) => call<{ imported: number }>('import_solo_data', command),
  }
}
