import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach,describe,expect,it } from 'vitest'
import { LocalDb } from './db'
import { bindWorkspaceOwner,openCaptureSession,newSurveyDraft,saveSurveyDraft,queueSurveyDraft,flushCapture,requestCaptureFinish,type CaptureRemote } from './capture-store'

const databases:LocalDb[]=[]
const create=()=>{const db=new LocalDb('capture-flow-'+crypto.randomUUID());databases.push(db);return db}
afterEach(async()=>{for(const db of databases.splice(0))await db.delete()})
async function prepared(){const db=create();await bindWorkspaceOwner(db,'owner');const visit=await openCaptureSession(db,'owner','client');const draft={...newSurveyDraft(visit),version_id:'v1',brand_id:'competitor',raw_answers:{available:'false',count:'0'}};return{db,visit,draft}}
function server(){
 const submitted=new Map<string,unknown>(), calls:string[]=[]
 const remote:CaptureRemote={
  openVisit:async()=>{calls.push('open');return 'canonical-visit'},
  submit:async(id,payload)=>{calls.push('submit');const prior=submitted.get(id);if(prior && JSON.stringify(prior)!==JSON.stringify(payload))throw Error('Identity changed');submitted.set(id,payload);return{id}},
  finish:async()=>{calls.push('finish');return{finished:true}},
 }
 return{remote,submitted,calls}
}
describe('owner-bound offline capture',()=>{
 it('retains an unfinished form and one local visit after reload',async()=>{
  const {db,visit,draft}=await prepared()
  await saveSurveyDraft(db,draft)
  db.close();await db.open()
  expect((await openCaptureSession(db,'owner','client')).id).toBe(visit.id)
  expect((await db.capture_drafts.get(draft.id))?.raw_answers).toEqual({available:'false',count:'0'})
  expect(await db.capture_sessions.count()).toBe(1)
 })
 it('reuses a visit whose finish is waiting for reconnect',async()=>{
  const {db,visit}=await prepared()
  await requestCaptureFinish(db,'owner',visit.id)
  db.close();await db.open()
  expect((await openCaptureSession(db,'owner','client')).id).toBe(visit.id)
  expect(await db.capture_sessions.count()).toBe(1)
 })
 it('freezes the resolved visit and exact submission after a lost reply, retaining the same operation',async()=>{
  const {db,visit,draft}=await prepared(), s=server()
  await queueSurveyDraft(db,draft,{available:false,count:0})
  let loseReply=true
  const remote={...s.remote,submit:async(id:string,payload:Record<string,unknown>)=>{await s.remote.submit(id,payload);if(loseReply){loseReply=false;throw Error('reply lost')}return{id}}}
  await expect(flushCapture(db,'owner',remote)).rejects.toThrow('reply lost')
  const retained=(await db.capture_drafts.get(draft.id))!
  expect(retained.final_request).toMatchObject({visit_id:'canonical-visit',answers:{available:false,count:0}})
  db.close();await db.open()
  await requestCaptureFinish(db,'owner',visit.id)
  await flushCapture(db,'owner',remote)
  expect(s.submitted.size).toBe(1)
  expect(s.calls.filter(c=>c==='open')).toHaveLength(1)
  expect(s.calls.slice(-2)).toEqual(['submit','finish'])
  expect((await db.capture_drafts.get(draft.id))?.status).toBe('synced')
  expect((await db.capture_sessions.get(visit.id))?.finished_at).toBeTruthy()
  expect((await openCaptureSession(db,'owner','client')).id).not.toBe(visit.id)
 })
 it('retains a rejected answer for review and sends a corrected draft with a new identity',async()=>{
  const {db,visit,draft}=await prepared(), s=server()
  await queueSurveyDraft(db,draft,{count:-1})
  await expect(flushCapture(db,'owner',{...s.remote,submit:async()=>{throw Object.assign(Error('Required answer missing'),{code:'P0001'})}})).rejects.toThrow()
  expect((await db.capture_drafts.get(draft.id))?.status).toBe('rejected')
  await expect(requestCaptureFinish(db,'owner',visit.id)).rejects.toThrow('review')
  const corrected={...newSurveyDraft(visit),version_id:draft.version_id,brand_id:draft.brand_id,raw_answers:{count:'1'},supersedes:draft.id}
  await saveSurveyDraft(db,corrected);await queueSurveyDraft(db,corrected,{count:1})
  await flushCapture(db,'owner',s.remote)
  expect((await db.capture_drafts.get(draft.id))?.status).toBe('superseded')
  expect((await db.capture_drafts.get(corrected.id))?.status).toBe('synced')
  expect(s.submitted.size).toBe(1)
 })
 it('does not allow a different account to read into or flush a bound workspace',async()=>{
  const {db,draft}=await prepared();await queueSurveyDraft(db,draft,{available:false,count:0})
  await expect(bindWorkspaceOwner(db,'other')).rejects.toThrow('another owner')
  await expect(openCaptureSession(db,'other','client')).rejects.toThrow('verify')
  await expect(flushCapture(db,'other',server().remote)).rejects.toThrow('verify')
  expect(await db.capture_drafts.count()).toBe(1)
 })
 it('refuses to bind old unpartitioned records to a different owner without deleting them',async()=>{
  const db=create()
  await db.commands.put({id:'old',owner_id:'previous-owner',rpc:'update_solo_client',request:{},queued_at:'old',attempts:0})
  await expect(bindWorkspaceOwner(db,'owner')).rejects.toThrow('another account')
  expect(await db.commands.count()).toBe(1)
  expect(await db.local_meta.count()).toBe(0)
 })
 it('preserves version-2 commands and legacy outbox rows on the additive local upgrade',async()=>{
  const db=create(), old=new Dexie(db.name)
  old.version(2).stores({outlets:'id, assigned_rep, area, retail_name',products:'id,product_line,active',survey_brands:'id,active',visits:'id,outlet_id,checked_in_at',survey_answers:'id,visit_id',orders:'id,visit_id,outlet_id',order_lines:'id,order_id',payments:'id,outlet_id,order_id',outbox:'++seq,table,row_id',commands:'id,owner_id,queued_at'})
  await old.table('outbox').add({table:'payments',row_id:'legacy',payload:{amount:123},queued_at:'old',attempts:3})
  await old.table('commands').put({id:'existing',owner_id:'owner',rpc:'post_solo_collection',request:{amount:'2.00'},queued_at:'old',attempts:1})
  old.close();await db.open()
  expect((await db.outbox.toArray())[0]).toMatchObject({row_id:'legacy',attempts:3,payload:{amount:123}})
  expect((await db.commands.get('existing'))?.request).toEqual({amount:'2.00'})
  expect(await db.capture_drafts.count()).toBe(0)
 })
 it('keeps unconfirmed submissions immutable and does not finish a visit before a queued survey',async()=>{
  const {db,visit,draft}=await prepared(),s=server()
  await saveSurveyDraft(db,draft)
  await expect(requestCaptureFinish(db,'owner',visit.id)).rejects.toThrow('Submit')
  await queueSurveyDraft(db,draft,{count:0})
  await expect(saveSurveyDraft(db,{...draft,raw_answers:{count:'1'}})).rejects.toThrow('cannot be changed')
  await requestCaptureFinish(db,'owner',visit.id)
  await flushCapture(db,'owner',s.remote)
  expect(s.calls).toEqual(['open','submit','finish'])
 })
})
