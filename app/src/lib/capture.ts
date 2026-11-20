import type { LocalDb } from './db'
import { operation, type Operation } from './solo-api'

export type SurveyQuestion = { id: string; label: string; type: string; required: boolean; options?: string[] }
export function surveyAnswers(questions: SurveyQuestion[], values: FormData) {
  return Object.fromEntries(questions.flatMap(q => {
    const value = String(values.get('answer:' + q.id) ?? '').trim()
    if (!value) {
      if (q.required) throw Error('Answer required: ' + q.label)
      return []
    }
    if (q.type === 'number' && !Number.isFinite(Number(value))) throw Error('Enter a valid number: ' + q.label)
    if (q.type === 'boolean' && !['true', 'false'].includes(value)) throw Error('Choose yes or no: ' + q.label)
    if (q.type === 'choice' && !q.options?.includes(value)) throw Error('Choose an available answer: ' + q.label)
    return [[q.id, q.type === 'number' ? Number(value) : q.type === 'boolean' ? value === 'true' : value]]
  })) as Record<string, string | number | boolean>
}

/** Reuse uncertain capture operations only; never merge separate financial receipts. */
export async function captureOperation<T extends { outlet_id: string }>(db: LocalDb, ownerId: string, rpc: string, request: T): Promise<Operation<T>> {
  const previous = (await db.commands.where('owner_id').equals(ownerId).toArray()).find(row =>
    row.rpc === rpc && (row.request as { outlet_id?: string }).outlet_id === request.outlet_id)
  if (!previous) return operation(request)
  if (JSON.stringify(previous.request) !== JSON.stringify(request)) throw Error('An earlier submission is waiting to sync. Sync it before changing these details.')
  return { id: previous.id, request: previous.request as T }
}
