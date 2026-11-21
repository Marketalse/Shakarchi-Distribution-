import 'fake-indexeddb/auto'
import {it,expect,vi} from 'vitest'
import {LocalDb} from './db'
import {watchAutoSync} from './auto-sync'
it('automatically retries on reconnect, foreground, queue growth and the timer, without a Sync press',async()=>{
 vi.useFakeTimers({toFake:['setInterval','clearInterval']})
 const db=new LocalDb('auto-sync-'+crypto.randomUUID()),window=new EventTarget(),document=Object.assign(new EventTarget(),{visibilityState:'visible'})
 let online=false;const run=vi.fn(async()=>{}),refresh=vi.fn(async()=>{})
 const stop=watchAutoSync(db,run,refresh,{window,document,online:()=>online})
 try{
  await db.commands.add({id:'one',owner_id:'owner',rpc:'update_solo_client',request:{},queued_at:'now',attempts:0});await new Promise(r=>setTimeout(r,30));expect(run).not.toHaveBeenCalled()
  online=true;window.dispatchEvent(new Event('online'));expect(run).toHaveBeenCalledTimes(1)
  document.visibilityState='hidden';document.dispatchEvent(new Event('visibilitychange'));expect(run).toHaveBeenCalledTimes(1)
  document.visibilityState='visible';document.dispatchEvent(new Event('visibilitychange'));expect(run).toHaveBeenCalledTimes(2)
  vi.advanceTimersByTime(30000);expect(run).toHaveBeenCalledTimes(3)
  await db.commands.add({id:'two',owner_id:'owner',rpc:'update_solo_client',request:{},queued_at:'later',attempts:0});await new Promise(r=>setTimeout(r,30));expect(run.mock.calls.length).toBeGreaterThan(3)
  const before=run.mock.calls.length;stop();window.dispatchEvent(new Event('online'));expect(run).toHaveBeenCalledTimes(before)
 }finally{stop();vi.useRealTimers();await db.delete()}
})
