import {it,expect,vi} from 'vitest'
import {watchAdminRefresh} from './admin-refresh'
it('refreshes confirmed data on timer/resume/reconnect, pauses offline or hidden, and cleans up',()=>{
 vi.useFakeTimers()
 const window=new EventTarget(),document=Object.assign(new EventTarget(),{visibilityState:'visible'})
 let online=true;const refresh=vi.fn(),clock=vi.fn(),stop=watchAdminRefresh(refresh,clock,{window,document,online:()=>online})
 try{
  vi.advanceTimersByTime(30000);expect(refresh).toHaveBeenCalledTimes(1);expect(clock).toHaveBeenCalledTimes(1)
  document.visibilityState='hidden';vi.advanceTimersByTime(30000);expect(refresh).toHaveBeenCalledTimes(1)
  document.visibilityState='visible';document.dispatchEvent(new Event('visibilitychange'));expect(refresh).toHaveBeenCalledTimes(2)
  online=false;vi.advanceTimersByTime(30000);expect(refresh).toHaveBeenCalledTimes(2)
  online=true;window.dispatchEvent(new Event('online'));expect(refresh).toHaveBeenCalledTimes(3)
  window.dispatchEvent(new Event('focus'));expect(refresh).toHaveBeenCalledTimes(4)
  stop();vi.advanceTimersByTime(30000);window.dispatchEvent(new Event('focus'));expect(refresh).toHaveBeenCalledTimes(4)
 }finally{stop();vi.useRealTimers()}
})
