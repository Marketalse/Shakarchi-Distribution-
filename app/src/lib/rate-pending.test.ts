import 'fake-indexeddb/auto'
import {afterEach,expect,it} from 'vitest'
import {LocalDb} from './db'
import {sendCommand} from './commands'
import {archiveRejectedRate,inspectPendingRate,manualRateRequest} from './rate-pending'
const databases:LocalDb[]=[]
const create=()=>{const db=new LocalDb('rate-pending-'+crypto.randomUUID());databases.push(db);return db}
afterEach(async()=>{for(const db of databases.splice(0))await db.delete()})
const command=()=>({id:crypto.randomUUID(),request:{exchange_rate_used:'1500',valid_until:'2026-11-22T12:00:00Z',rate_source:'Synthetic'}})
const validation='Enter a positive IQD-per-USD rate, source and future expiry'
it('rejects past or invalid Baghdad expiry and invalid rates before creating an operation',()=>{
 const now=Date.parse('2026-11-22T12:00:00Z')
 expect(manualRateRequest('1500','2026-11-22T16:00',now)).toEqual({exchange_rate_used:'1500',rate_source:'Manual admin entry',valid_until:'2026-11-22T13:00:00.000Z'})
 expect(()=>manualRateRequest('1500','2026-11-22T15:00',now)).toThrow('later than now')
 expect(()=>manualRateRequest('1500','2027-02-30T16:00',now)).toThrow('valid Baghdad')
 expect(()=>manualRateRequest('0','2026-11-22T16:00',now)).toThrow('above zero')
 expect(()=>manualRateRequest('1.000000001','2026-11-22T16:00',now)).toThrow('valid decimal')
 expect(manualRateRequest('1500','2026-11-22T16:00:30',now).valid_until).toBe('2026-11-22T13:00:30.000Z')
})
it('keeps a lost-response request frozen and refuses correction',async()=>{
 const db=create(),item=command()
 await expect(sendCommand(db,'owner','publish_solo_fx_rate',item.id,item.request,async()=>{throw Error('response lost')})).rejects.toThrow()
 expect(await inspectPendingRate(db,'owner',item)).toBe('pending')
 await expect(archiveRejectedRate(db,'owner',item)).rejects.toThrow('original submission')
 expect((await db.commands.get(item.id))?.request).toEqual(item.request)
})
it('archives only a definitive rate-validation rejection and preserves unrelated pending finance',async()=>{
 const db=create(),item=command()
 await expect(sendCommand(db,'owner','publish_solo_fx_rate',item.id,item.request,async()=>{throw Object.assign(Error(validation),{code:'P0001'})})).rejects.toThrow()
 await db.commands.add({id:'receipt',owner_id:'owner',rpc:'post_solo_collection',request:{amount:'10.00'},attempts:0,queued_at:'old'})
 expect(await inspectPendingRate(db,'owner',item)).toBe('rejected')
 await archiveRejectedRate(db,'owner',item)
 expect(await db.commands.get(item.id)).toBeUndefined()
 expect(await db.commands.get('receipt')).toBeDefined()
 const archive=JSON.parse((await db.local_meta.get('rejected-rate:owner:'+item.id))!.value)
 expect(archive.command.request).toEqual(item.request);expect(archive.command.id).toBe(item.id)
})
it('recognizes a background acknowledgment and prevents replacing an already saved operation',async()=>{
 const db=create(),item=command()
 await sendCommand(db,'owner','publish_solo_fx_rate',item.id,item.request,async()=>({rate_version_id:item.id}))
 expect(await inspectPendingRate(db,'owner',item)).toBe('acknowledged')
 await expect(archiveRejectedRate(db,'owner',item)).rejects.toThrow('original submission')
 expect(await db.local_meta.get('command-result:'+item.id)).toBeDefined()
})
it('does not unlock identity conflicts, other owners or missing queue evidence',async()=>{
 const db=create(),item=command()
 expect(await inspectPendingRate(db,'owner',item)).toBe('pending')
 await expect(sendCommand(db,'owner','publish_solo_fx_rate',item.id,item.request,async()=>{throw Object.assign(Error('Operation identity mismatch'),{code:'P0001'})})).rejects.toThrow()
 expect(await inspectPendingRate(db,'owner',item)).toBe('pending')
 await expect(inspectPendingRate(db,'other',item)).rejects.toThrow('different details')
 await expect(inspectPendingRate(db,'owner',{...item,request:{}})).rejects.toThrow('different details')
 await expect(archiveRejectedRate(db,'owner',item)).rejects.toThrow()
})
it('exact retry after lost response returns the original result without creating a new rate identity',async()=>{
 const db=create(),item=command(),ids:string[]=[]
 let saved:unknown
 const remote=async(_rpc:string,id:string)=>{ids.push(id);if(!saved){saved={rate_version_id:id};throw Error('reply lost')}return saved}
 await expect(sendCommand(db,'owner','publish_solo_fx_rate',item.id,item.request,remote)).rejects.toThrow()
 expect(await inspectPendingRate(db,'owner',item)).toBe('pending')
 expect(await sendCommand(db,'owner','publish_solo_fx_rate',item.id,item.request,remote)).toEqual({rate_version_id:item.id})
 expect(ids).toEqual([item.id,item.id]);expect(await inspectPendingRate(db,'owner',item)).toBe('acknowledged')
})
