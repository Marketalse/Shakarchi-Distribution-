import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { LocalDb } from './db'
import { flush, pendingCount, type Remote } from './sync'
import { localBalance, newId, saveVisit, type VisitDraft } from './visit'
import type { UploadTable } from './types'

/** Stands in for the server: remembers rows by id and can be switched offline. */
class FakeServer implements Remote {
  rows = new Map<string, Record<string, unknown>>()
  calls: UploadTable[] = []
  failAfter = Infinity
  async insertIfMissing(table: UploadTable, row: Record<string, unknown>) {
    if (this.calls.length >= this.failAfter) throw new Error('no signal')
    this.calls.push(table)
    const key = `${table}:${row.id as string}`
    if (!this.rows.has(key)) this.rows.set(key, row)
  }
}

const REP = 'rep-1'
const OUTLET = 'outlet-1'

function fullVisit(): VisitDraft {
  const visitId = newId()
  const orderId = newId()
  return {
    visit: { id: visitId, outlet_id: OUTLET, rep_id: REP, checked_in_at: '2026-11-14T10:00:00Z', outcome: 'order_taken' },
    survey: [{ id: newId(), visit_id: visitId, brand_id: 'brand-1', present: true, facings: 6 }],
    order: { id: orderId, visit_id: visitId, outlet_id: OUTLET, rep_id: REP, payment_type: 'credit' },
    lines: [
      { id: newId(), order_id: orderId, product_id: 'p1', kind: 'sale', quantity: 10, unit_price: 12000 },
      { id: newId(), order_id: orderId, product_id: 'p2', kind: 'return', quantity: 1, unit_price: 12000 },
    ],
    payment: { id: newId(), outlet_id: OUTLET, visit_id: visitId, order_id: orderId, amount: 50000, method: 'cash', collected_by: REP, collected_at: '2026-11-14T10:05:00Z' },
  }
}

let db: LocalDb
let n = 0
beforeEach(() => { db = new LocalDb(`test-${++n}`) })

describe('saving a visit offline', () => {
  it('stores every part and queues it for upload', async () => {
    await saveVisit(db, fullVisit())
    expect(await db.visits.count()).toBe(1)
    expect(await db.order_lines.count()).toBe(2)
    expect(await pendingCount(db)).toBe(6) // visit, survey, order, 2 lines, payment
  })

  it('saves nothing when one part is invalid', async () => {
    const draft = fullVisit()
    draft.lines = []
    await expect(saveVisit(db, draft)).rejects.toThrow()
    expect(await db.visits.count()).toBe(0)
    expect(await pendingCount(db)).toBe(0)
  })

  it('works out the balance from sales, returns and payments', async () => {
    await saveVisit(db, fullVisit())
    // 10 x 12,000 sale - 1 x 12,000 return - 50,000 paid
    expect(await localBalance(db, OUTLET)).toBe(58000)
  })
})

describe('uploading', () => {
  it('sends parents before children and empties the queue', async () => {
    await saveVisit(db, fullVisit())
    const server = new FakeServer()
    const result = await flush(db, server)
    expect(result).toEqual({ uploaded: 6, remaining: 0 })
    expect(server.calls).toEqual(['visits', 'survey_answers', 'orders', 'order_lines', 'order_lines', 'payments'])
  })

  it('keeps unsent rows when the signal drops, then finishes later', async () => {
    await saveVisit(db, fullVisit())
    const server = new FakeServer()
    server.failAfter = 3
    const first = await flush(db, server)
    expect(first.uploaded).toBe(3)
    expect(first.remaining).toBe(3)
    expect(first.stoppedBy).toBe('no signal')

    server.failAfter = Infinity
    const second = await flush(db, server)
    expect(second).toEqual({ uploaded: 3, remaining: 0 })
    expect(server.rows.size).toBe(6)
  })

  it('never creates duplicates when the same rows are sent twice', async () => {
    const draft = fullVisit()
    await saveVisit(db, draft)
    const server = new FakeServer()
    await flush(db, server)
    // The phone lost the confirmation and queues the visit again.
    await db.outbox.add({ table: 'visits', row_id: draft.visit.id, payload: { ...draft.visit }, queued_at: '', attempts: 0 })
    await flush(db, server)
    expect(server.rows.size).toBe(6)
  })

  it('keeps the order across two visits', async () => {
    await saveVisit(db, fullVisit())
    await saveVisit(db, fullVisit())
    const server = new FakeServer()
    await flush(db, server)
    const firstOrderLine = server.calls.indexOf('order_lines')
    const lastOrder = server.calls.lastIndexOf('orders')
    expect(lastOrder).toBeLessThan(firstOrderLine)
    expect(server.rows.size).toBe(12)
  })
})
