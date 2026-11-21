import {liveQuery} from 'dexie'
import type {LocalDb} from './db'
type Surface={window:EventTarget;document:EventTarget&{visibilityState:string};online:()=>boolean}
export function watchAutoSync(db:LocalDb,run:()=>Promise<void>,refresh:()=>Promise<void>,surface:Surface={window,document,online:()=>navigator.onLine}){
 let previous=''
 const start=()=>{if(surface.online())void run()}
 const resume=()=>{if(surface.document.visibilityState==='visible')start()}
 const timer=setInterval(resume,30000)
 const queue=liveQuery(async()=>JSON.stringify([await db.outbox.count(),await db.commands.count(),await db.capture_drafts.filter(d=>d.status==='queued').count(),await db.capture_sessions.filter(s=>!s.finished_at&&(!s.server_visit_id||Boolean(s.finish_requested))).count()])).subscribe(value=>{if(previous===value)return;previous=value;void refresh();start()})
 surface.window.addEventListener('online',start);surface.window.addEventListener('focus',resume);surface.document.addEventListener('visibilitychange',resume)
 start()
 return ()=>{clearInterval(timer);queue.unsubscribe();surface.window.removeEventListener('online',start);surface.window.removeEventListener('focus',resume);surface.document.removeEventListener('visibilitychange',resume)}
}
