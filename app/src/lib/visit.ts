import type { LocalDb } from './db'
import { enqueue } from './sync'
import type { Order, OrderLine, Payment, SurveyAnswer, Visit } from './types'

export const newId = (): string => crypto.randomUUID()

/** Everything captured in one shop visit. Only `visit` is required. */
export interface VisitDraft {
  visit: Visit
  survey?: SurveyAnswer[]
  order?: Order
  lines?: OrderLine[]
  payment?: Payment
}

/**
 * Save a whole visit to the phone in one step and queue it for upload.
 * Either every part is saved or none is, so a visit can never be half-recorded.
 */
export async function saveVisit(db: LocalDb, draft: VisitDraft): Promise<void> {
  const { visit, survey = [], order, lines = [], payment } = draft
  if (visit.lat !== undefined || visit.lng !== undefined) throw new Error('Visits reuse the saved client location; new GPS samples are not accepted')
  if (lines.length > 0 && !order) throw new Error('Order lines need an order')
  if (order && lines.length === 0) throw new Error('An order needs at least one line')

  await db.transaction(
    'rw',
    [db.visits, db.survey_answers, db.orders, db.order_lines, db.payments, db.outbox],
    async () => {
      await db.visits.add(visit)
      await enqueue(db, 'visits', { ...visit })
      for (const answer of survey) {
        await db.survey_answers.add(answer)
        await enqueue(db, 'survey_answers', { ...answer })
      }
      if (order) {
        await db.orders.add(order)
        await enqueue(db, 'orders', { ...order })
        for (const line of lines) {
          await db.order_lines.add(line)
          await enqueue(db, 'order_lines', { ...line })
        }
      }
      if (payment) {
        await db.payments.add(payment)
        await enqueue(db, 'payments', { ...payment })
      }
    },
  )
}

/** What the outlet owes, from what is on the phone: sales minus payments. */
export async function localBalance(db: LocalDb, outletId: string): Promise<number> {
  const orders = await db.orders.where('outlet_id').equals(outletId).toArray()
  let sales = 0
  for (const o of orders) {
    const lines = await db.order_lines.where('order_id').equals(o.id).toArray()
    for (const l of lines) sales += (l.kind === 'return' ? -1 : 1) * l.quantity * l.unit_price
  }
  const payments = await db.payments.where('outlet_id').equals(outletId).toArray()
  const paid = payments.reduce((sum, p) => sum + p.amount, 0)
  return sales - paid
}
