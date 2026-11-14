import type { LocalDb } from './db'
import { UPLOAD_ORDER, type OutboxItem, type UploadTable } from './types'

/**
 * The remote side of sync. In the app this is Supabase; in tests it is a fake.
 * `insertIfMissing` must do nothing when a row with the same id already exists,
 * which is what makes uploading the same visit twice harmless.
 */
export interface Remote {
  insertIfMissing(table: UploadTable, row: Record<string, unknown>): Promise<void>
}

export interface FlushResult {
  uploaded: number
  remaining: number
  /** Set when the run stopped early, e.g. the signal dropped. */
  stoppedBy?: string
}

/** Add a row to the upload queue. Call inside the same transaction that saves the row. */
export async function enqueue(
  db: LocalDb,
  table: UploadTable,
  row: { id: string } & Record<string, unknown>,
): Promise<void> {
  await db.outbox.add({
    table,
    row_id: row.id,
    payload: row,
    queued_at: new Date().toISOString(),
    attempts: 0,
  })
}

/**
 * Upload everything in the queue.
 *
 * Rows go table by table in the order the database needs (an order line cannot
 * arrive before its order). A row leaves the queue only after the server has
 * confirmed it. The run stops at the first failure so nothing is uploaded out
 * of order; whatever is left is retried on the next run.
 */
export async function flush(db: LocalDb, remote: Remote): Promise<FlushResult> {
  let uploaded = 0
  for (const table of UPLOAD_ORDER) {
    const items: OutboxItem[] = await db.outbox.where('table').equals(table).sortBy('seq')
    for (const item of items) {
      try {
        await remote.insertIfMissing(table, item.payload)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        await db.outbox.update(item.seq!, {
          attempts: item.attempts + 1,
          last_error: message,
        })
        return { uploaded, remaining: await db.outbox.count(), stoppedBy: message }
      }
      await db.outbox.delete(item.seq!)
      uploaded++
    }
  }
  return { uploaded, remaining: await db.outbox.count() }
}

export function pendingCount(db: LocalDb): Promise<number> {
  return db.outbox.count()
}
