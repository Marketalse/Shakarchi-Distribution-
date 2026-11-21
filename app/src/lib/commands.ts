import type { LocalDb } from './db'

export type PendingCommand = {
  id: string; owner_id: string; rpc: string; request: unknown
  queued_at: string; attempts: number; last_error?: string
}
export type CommandRemote = (rpc: string, id: string, request: unknown) => Promise<unknown>
const supported = new Set(['issue_solo_invoice_v2','update_solo_product_v2','import_solo_data_v2','issue_solo_invoice', 'post_solo_collection', 'reschedule_solo_reminder',
  'set_solo_service_area', 'publish_solo_survey', 'submit_solo_survey', 'publish_solo_fx_rate', 'update_solo_product', 'import_solo_data', 'finish_solo_visit', 'correct_solo_client_location', 'update_solo_client', 'submit_solo_observation'])

export async function sendCommand(db: LocalDb, ownerId: string, rpc: string, id: string, request: unknown, remote: CommandRemote) {
  if (!supported.has(rpc)) throw Error('Unsupported operation; retained for review.')
  const command = await db.transaction('rw', db.commands, async () => {
    const previous = await db.commands.get(id)
    if (previous && (previous.owner_id !== ownerId || previous.rpc !== rpc || JSON.stringify(previous.request) !== JSON.stringify(request))) throw Error('Operation identity already belongs to different details.')
    const frozen = previous ?? { id, owner_id: ownerId, rpc, request: structuredClone(request), queued_at: new Date().toISOString(), attempts: 0 }
    await db.commands.put(frozen)
    return frozen
  })
  try {
    const result = await remote(rpc, command.id, command.request)
    await db.commands.delete(command.id)
    return result
  } catch (failure) {
    await db.commands.update(command.id, { attempts: command.attempts + 1, last_error: failure instanceof Error ? failure.message : String(failure) })
    throw failure
  }
}

export async function flushCommands(db: LocalDb, ownerId: string, remote: CommandRemote) {
  const commands = await db.commands.where('owner_id').equals(ownerId).sortBy('queued_at')
  for (const item of commands) await sendCommand(db, ownerId, item.rpc, item.id, item.request, remote)
}
