import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { LocalDb } from './db'
import { flushCommands, sendCommand } from './commands'

const databases: LocalDb[] = []
const create = () => { const db = new LocalDb('commands-' + crypto.randomUUID()); databases.push(db); return db }
afterEach(async () => { for (const db of databases.splice(0)) await db.delete() })

describe('durable operation commands', () => {
  it('retains exact identity after a lost response and replays after reopening', async () => {
    const db = create(), id = crypto.randomUUID(), request = { currency: 'USD', amount: '10.25' }
    await expect(sendCommand(db, 'owner', 'post_solo_collection', id, request, async () => { throw Error('reply lost') })).rejects.toThrow('reply lost')
    db.close()
    const reopened = new LocalDb(db.name)
    const calls: unknown[] = []
    await flushCommands(reopened, 'owner', async (...args) => { calls.push(args); return { saved: true } })
    expect(calls).toEqual([['post_solo_collection', id, request]])
    expect(await reopened.commands.count()).toBe(0)
    reopened.close()
  })
  it('does not send another owner’s command or overwrite a different payload', async () => {
    const db = create(), id = crypto.randomUUID()
    await expect(sendCommand(db, 'owner', 'issue_solo_invoice', id, { amount: '2.00' }, async () => { throw Error('offline') })).rejects.toThrow()
    await flushCommands(db, 'other', async () => { throw Error('must not send') })
    await expect(sendCommand(db, 'owner', 'issue_solo_invoice', id, { amount: '3.00' }, async () => null)).rejects.toThrow('different details')
    expect(await db.commands.count()).toBe(1)
  })
  it('retains a definitively rejected command, preserving unrelated legacy rows', async () => {
    const db = create()
    await db.outbox.add({ table: 'payments', row_id: 'legacy', payload: { amount: 50000 }, queued_at: 'old', attempts: 0 })
    await expect(sendCommand(db, 'owner', 'post_solo_collection', crypto.randomUUID(), {}, async () => { throw Object.assign(Error('rejected'), { code: '22023' }) })).rejects.toThrow()
    expect(await db.commands.count()).toBe(1)
    expect(await db.outbox.count()).toBe(1)
  })
})

it('serializes competing tabs before freezing an operation payload',async()=>{
 const db=create(),operation=crypto.randomUUID();const other=new LocalDb(db.name);let release!:()=>void;
 const gate=new Promise<void>(r=>{release=r});const first=sendCommand(db,'owner','issue_solo_invoice_v2',operation,{quantity:0.5},async()=>{await gate;throw Error('lost')});
 await new Promise(r=>setTimeout(r,10));
 await expect(sendCommand(other,'owner','issue_solo_invoice_v2',operation,{quantity:1},async()=>null)).rejects.toThrow('different details');
 release();await expect(first).rejects.toThrow('lost');expect((await db.commands.get(operation))?.request).toEqual({quantity:0.5});other.close();
})
