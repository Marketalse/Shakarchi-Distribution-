import 'fake-indexeddb/auto'
import {afterEach,it,expect} from 'vitest'
import {LocalDb} from './db'
import {bindWorkspaceOwner,openCaptureSession,requestCaptureFinish} from './capture-store'
import {createOutlet} from './outlet'
import {sendCommand} from './commands'
import {flushWorkspace} from './workspace-sync'
import {cachedFieldRead,offlineOwner} from './offline'
import {stagePhoto} from './attachments'
const stores:LocalDb[]=[]
const make=()=>{const d=new LocalDb('offline-flow-'+crypto.randomUUID());stores.push(d);return d}
afterEach(async()=>{for(const d of stores.splice(0))await d.delete()})
it('keeps a new client, order and fixed visit mapping across offline reload and a lost server acknowledgment',async()=>{
 const db=make();await bindWorkspaceOwner(db,'owner')
 const client=await createOutlet(db,{retail_name:'Test store',province:'Baghdad',area:'Test',outlet_type:'Retail',relationship:'customer',lat:33,lng:44,assigned_rep:'owner'})
 const stop=await openCaptureSession(db,'owner',client.id,'order'),id=crypto.randomUUID()
 const request={currency:'USD',visit_id:stop.id,outlet_id:client.id,items:[{quantity:0.5,price:'1.99'}]}
 await expect(sendCommand(db,'owner','issue_solo_invoice_v2',id,request,async()=>{throw Error('must not send before visit resolution')})).rejects.toThrow('waiting to sync')
 await requestCaptureFinish(db,'owner',stop.id);db.close();await db.open()
 const clients=new Set<string>(),invoices=new Map<string,unknown>(),events:string[]=[];let lost=true
 const outbox={insertIfMissing:async(_table:string,row:Record<string,unknown>)=>{clients.add(String(row.id));events.push('client')}}
 const remote={openVisit:async(_id:string,outlet:string,source?:string)=>{expect(clients.has(outlet)).toBe(true);expect(source).toBe('order');events.push('open');return 'resolved-original'},submit:async()=>null,finish:async(_id:string,visit:string)=>{expect(visit).toBe('resolved-original');events.push('finish')}}
 const post=async(_rpc:string,op:string,payload:unknown)=>{expect((payload as {visit_id:string}).visit_id).toBe('resolved-original');invoices.set(op,payload);events.push('post');if(lost){lost=false;throw Error('reply lost')}return {order_id:op,invoice_no:1}}
 expect((await flushWorkspace(db,'owner',outbox,remote,post)).join()).toContain('reply lost')
 expect((await db.commands.get(id))?.request).toEqual(request)
 expect((await db.commands.get(id))?.posted_request).toEqual({...request,visit_id:'resolved-original'})
 expect((await db.capture_sessions.get(stop.id))?.finished_at).toBeUndefined()
 db.close();await db.open();expect(await flushWorkspace(db,'owner',outbox,remote,post)).toEqual([])
 expect(clients.size).toBe(1);expect(invoices.size).toBe(1);expect(events.filter(e=>e==='open')).toHaveLength(1);expect(events.at(-1)).toBe('finish')
 expect(await db.commands.count()).toBe(0);expect((await db.capture_sessions.get(stop.id))?.finished_at).toBeTruthy()
 expect(await sendCommand(db,'owner','issue_solo_invoice_v2',id,request,async()=>{throw Error('must not repost acknowledged data')})).toEqual({order_id:id,invoice_no:1})
})
it('serves owner-bound cached data after reload and never invents a zero for an unavailable snapshot',async()=>{
 const db=make();await bindWorkspaceOwner(db,'owner');const values={amount:'19.90',answer:0,available:false}
 await cachedFieldRead(db,'fixture',async()=>values,true);db.close();await db.open()
 expect(await cachedFieldRead(db,'fixture',async()=>{throw Error('offline')},false)).toEqual(values)
 await expect(cachedFieldRead(db,'missing',async()=>null,false)).rejects.toThrow('Not available offline')
 await expect(bindWorkspaceOwner(db,'other')).rejects.toThrow('another owner')
 await db.local_meta.put({key:'offline-access-disabled',value:'true'});await expect(offlineOwner(db)).rejects.toThrow('Sign in')
})
it('retains a queued photo across reload and removes it only after command acknowledgment',async()=>{
 const db=make();await bindWorkspaceOwner(db,'owner');const id=crypto.randomUUID(),request={photo_path:'owner/'+id}
 const file=new File(['photo-bytes'],'test.png',{type:'image/png'});await stagePhoto(db,'owner',id,request,file);db.close();await db.open()
 expect((await db.attachments.get(id))?.digest).toBeTruthy();expect(await db.commands.count()).toBe(1)
 await expect(sendCommand(db,'owner','submit_solo_observation',id,request,async()=>{throw Error('offline')})).rejects.toThrow('offline');expect(await db.attachments.count()).toBe(1)
 await sendCommand(db,'owner','submit_solo_observation',id,request,async()=>({observation_id:id}));expect(await db.attachments.count()).toBe(0)
})
it('uploads an independent valid command even when another retained command needs review',async()=>{
 const db=make();await bindWorkspaceOwner(db,'owner')
 await expect(sendCommand(db,'owner','update_solo_client','bad',{},async()=>{throw Object.assign(Error('review'),{code:'22023'})})).rejects.toThrow()
 await expect(sendCommand(db,'owner','update_solo_client','good',{outlet_id:'other'},async()=>{throw Error('offline')})).rejects.toThrow()
 const sent:string[]=[]
 await flushWorkspace(db,'owner',{insertIfMissing:async()=>{}},{openVisit:async()=>'',submit:async()=>null,finish:async()=>null},async(_rpc,id)=>{sent.push(id);return {outlet_id:id}})
 expect(sent).toEqual(['good']);expect(await db.commands.count()).toBe(1)
})

it('locks cached access on a definitive server owner denial, while preserving queued records',async()=>{
 const {verifySyncOwner}=await import('./sync-access');const db=make();await bindWorkspaceOwner(db,'owner');await db.commands.add({id:'saved',owner_id:'owner',rpc:'update_solo_client',request:{},queued_at:'now',attempts:0})
 const client={auth:{getUser:async()=>({data:{user:{id:'owner'}},error:null})},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null,error:null})})})})} as unknown as import('@supabase/supabase-js').SupabaseClient
 await expect(verifySyncOwner(client,'owner',db)).rejects.toThrow('retained');await expect(offlineOwner(db)).rejects.toThrow('Sign in');expect(await db.commands.count()).toBe(1)
})

it('does not let one rejected new client block an independent valid client upload',async()=>{
 const db=make();await bindWorkspaceOwner(db,'owner');for(const id of ['bad','good'])await db.outbox.add({table:'outlets',row_id:id,payload:{id},queued_at:'now',attempts:0})
 const uploaded:string[]=[]
 const errors=await flushWorkspace(db,'owner',{insertIfMissing:async(_table,row)=>{if(row.id==='bad')throw Error('Client needs review');uploaded.push(String(row.id))}},{openVisit:async()=>'',submit:async()=>null,finish:async()=>null},async()=>null)
 expect(uploaded).toEqual(['good']);expect(errors.join()).toContain('needs review');expect(await db.outbox.count()).toBe(1)
})

it('upgrades an existing device database without dropping legacy financial or pending command records',async()=>{
 const {default:Dexie}=await import('dexie');const name='offline-upgrade-'+crypto.randomUUID(),old=new Dexie(name)
 old.version(3).stores({outlets:'id,assigned_rep,area,retail_name',products:'id,product_line,active',survey_brands:'id,active',visits:'id,outlet_id,checked_in_at',survey_answers:'id,visit_id',orders:'id,visit_id,outlet_id',order_lines:'id,order_id',payments:'id,outlet_id,order_id',outbox:'++seq,table,row_id',commands:'id,owner_id,queued_at',local_meta:'key',capture_reference:'owner_id',capture_sessions:'id,owner_id,[owner_id+outlet_id],opened_at',capture_drafts:'id,owner_id,session_id,status,created_at'})
 await old.table('outbox').add({table:'payments',row_id:'legacy',payload:{id:'legacy',amount:50000},queued_at:'before',attempts:0});await old.table('commands').put({id:'uncertain',owner_id:'owner',rpc:'issue_solo_invoice',request:{quantity:3},queued_at:'before',attempts:0});old.close()
 const current=new LocalDb(name);stores.push(current);expect(await current.outbox.count()).toBe(1);expect((await current.commands.get('uncertain'))?.request).toEqual({quantity:3});expect(await current.attachments.count()).toBe(0)
})
