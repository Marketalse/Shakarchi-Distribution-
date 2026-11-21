import type { LocalDb } from './db'

export type PendingCommand = {
  id: string; owner_id: string; rpc: string; request: unknown
  queued_at: string; attempts: number; last_error?: string
}
export type CommandRemote = (rpc: string, id: string, request: unknown) => Promise<unknown>
const supported = new Set(['issue_solo_invoice', 'post_solo_collection', 'reschedule_solo_reminder',
  'set_solo_service_area', 'publish_solo_survey', 'submit_solo_survey', 'publish_solo_fx_rate', 'update_solo_product', 'import_solo_data', 'finish_solo_visit', 'correct_solo_client_location', 'update_solo_client', 'submit_solo_observation'])

export async function sendCommand(db: LocalDb, ownerId: string, rpc: string, id: string, request: unknown, remote: CommandRemote) {
  if (!supported.has(rpc)) throw Error('Unsupported operation; retained for review.')
  const previous = await db.commands.get(id)
  if (previous && (previous.owner_id !== ownerId || previous.rpc !== rpc || JSON.stringify(previous.request) !== JSON.stringify(request))) {
    throw Error('Operation identity already belongs to different details.')
  }
  const command = previous ?? { id, owner_id: ownerId, rpc, request: structuredClone(request), queued_at: new Date().toISOString(), attempts: 0 }
  // Commit locally before the network request, including when the server reply is lost.
  await db.commands.put(command)
  try {
    const result = await remote(rpc, command.id, command.request)
    await db.commands.delete(command.id)
    return result
  } catch (failure) {
    const code = (failure as { code?: string }).code
    if (code && /^(P000[12]|22|23|42501)/.test(code)) await db.commands.delete(command.id)
    else await db.commands.update(command.id, { attempts: command.attempts + 1, last_error: failure instanceof Error ? failure.message : String(failure) })
    throw failure
  }
}

export async function flushCommands(db: LocalDb, ownerId: string, remote: CommandRemote) {
  const commands = await db.commands.where('owner_id').equals(ownerId).sortBy('queued_at')
  for (const item of commands) await sendCommand(db, ownerId, item.rpc, item.id, item.request, remote)
}
