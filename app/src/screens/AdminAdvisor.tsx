import {useEffect,useRef,useState} from 'react'
import {Link} from 'react-router-dom'
import {supabase} from '../lib/supabase'
import {advisorReason,type AdvisorSnapshot} from '../lib/advisor'
import {formatUsd} from '../lib/money'
type Result={snapshot?:AdvisorSnapshot;selected?:string[];ai?:boolean;model?:string;message?:string;error?:string}
export function AdminAdvisor(){
 const [result,setResult]=useState<Result>({}),[busy,setBusy]=useState(false),[consent,setConsent]=useState(false),[online,setOnline]=useState(navigator.onLine),[clock,setClock]=useState(()=>Date.now()),[review,setReview]=useState('')
 const active=useRef<AbortController|null>(null)
 useEffect(()=>{const update=()=>{setOnline(navigator.onLine);setClock(Date.now())};window.addEventListener('online',update);window.addEventListener('offline',update);const timer=setInterval(update,30000);return()=>{active.current?.abort();active.current=null;clearInterval(timer);window.removeEventListener('online',update);window.removeEventListener('offline',update)}},[])
 async function request(mode:'snapshot'|'test'|'brief'){
  if(busy||!navigator.onLine)return
  setBusy(true);setReview('');setResult({});if(mode==='brief')setConsent(false)
  const controller=new AbortController();active.current=controller;const timer=setTimeout(()=>controller.abort(),55000)
  try{
   const session=await supabase?.auth.getSession()
   const token=session?.data.session?.access_token
   if(!token)throw Error('Sign in again before using the advisor.')
   const response=await fetch('/api/advisor',{method:'POST',cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({mode,...(mode==='brief'?{consent}:{} )})})
   const body:Result=await response.json();setResult(body)
  }catch{if(!controller.signal.aborted||active.current===controller)setResult({error:'Could not reach the advisor. Check your connection and sign-in, then retry. No request was queued.'})}
  finally{clearTimeout(timer);if(active.current===controller){setBusy(false);active.current=null}}
 }
 const stale=result.snapshot&&clock-Date.parse(result.snapshot.asOf)>15*60000
 const selected=result.ai?result.snapshot?.candidates.filter(c=>result.selected?.includes(c.id)).sort((a,b)=>result.selected!.indexOf(a.id)-result.selected!.indexOf(b.id)):[]
 return <section className="admin-panel advisor-panel">
 <h2>Private advisor · collections pilot</h2>
 <p>Review uploaded invoice balances and collection priorities. Suggestions require your judgment; this advisor cannot post payments, change credit terms or contact customers.</p>
 <p className="admin-subtle">Fresh database evidence on each request. Exact USD amounts are calculated by the application. This pilot does not provide forecasts, credit scores or full financial statements.</p>
 {!online&&<p role="status" className="error">You are offline. AI requests are unavailable and will not be queued. Reconnect, then refresh the evidence.</p>}
 <div className="advisor-actions"><button className="secondary" disabled={busy||!online} onClick={()=>void request('snapshot')}>Refresh source evidence</button><button className="secondary" disabled={busy||!online} onClick={()=>void request('test')}>Test AI connection</button></div>
 <p className="admin-subtle">The connection test uses synthetic records only. AI calls are limited to one per minute per running server instance.</p>
 <label className="advisor-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} disabled={busy}/> Send anonymous urgency categories and balance rankings to OpenAI through Vercel AI Gateway for this request. No customer identities, exact amounts, dates, invoice IDs or notes are sent.</label>
 <button disabled={busy||!online||!consent} onClick={()=>void request('brief')}>{busy?'Checking…':'Generate collection priorities'}</button>
 {result.error&&<p role="alert" className="error">{result.error}</p>}
 {result.message&&<p role="status">{result.message} {result.model&&<small>Model: {result.model}</small>}</p>}
 {result.snapshot&&<>
 <h3>Source evidence · USD</h3>
 <p>Fetched {new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Baghdad',dateStyle:'medium',timeStyle:'short'}).format(new Date(result.snapshot.asOf))} · Baghdad time</p>
 {stale&&<p role="alert" className="error">This evidence is over 15 minutes old. Refresh before acting.</p>}
 <div className="admin-metrics"><div className="admin-metric"><span>Outstanding · all dates</span><strong>{formatUsd(result.snapshot.outstanding)}</strong></div><div className="admin-metric"><span>Overdue</span><strong>{formatUsd(result.snapshot.overdue)}</strong></div><div className="admin-metric"><span>Unknown due date</span><strong>{formatUsd(result.snapshot.unknownAging)}</strong></div></div>
 <p>{result.snapshot.candidateCount} eligible collection priorities. <Link to="/admin/collections">Open collections</Link></p>
 {result.snapshot.warnings.map(w=><p className="admin-subtle" key={w}>{w}</p>)}
 {result.ai&&!stale&&<><h3>AI selected review priorities</h3>{selected?.map(c=><article className="advisor-priority" key={c.id}><h4><Link to={'/admin/collections?invoice='+encodeURIComponent(c.invoiceId)}>{c.invoiceLabel}</Link> · {formatUsd(c.outstanding)} outstanding</h4><p>{advisorReason[c.kind]}</p><p className="admin-subtle">Due date: {c.dueDate??'Unknown'}{c.scheduledAt?' · Reminder: '+new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Baghdad',dateStyle:'medium',timeStyle:'short'}).format(new Date(c.scheduledAt)):''}</p></article>)}<label>Was this useful? <select value={review} onChange={e=>setReview(e.target.value)}><option value="">Choose after checking the sources</option><option>Useful</option><option>Needs improvement</option><option>Source concern</option></select></label>{review&&<p className="admin-subtle">Review noted for this session only; feedback is not yet stored.</p>}</>}
 {!result.ai&&<p>No AI recommendations are displayed. Source evidence alone is not an AI answer.</p>}
 </>}
 </section>
}
