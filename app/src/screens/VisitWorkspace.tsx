import {RetailTag} from './RetailTag'
import {retailReference} from '../lib/retail-reference'
import {useEffect,useState} from 'react'
import {Link} from 'react-router-dom'
import {liveQuery} from 'dexie'
import {db} from '../lib/db'
import {supabase} from '../lib/supabase'
import {visitPayments,lastCompletedVisit,visitRows,localVisitWork,type VisitInvoice,type VisitSource} from '../lib/visit-workspace'
import type {RecordedVisit} from '../lib/operational-report'
import type {Outlet} from '../lib/types'
import {formatUsd} from '../lib/money'
import {baghdadDay} from '../lib/reporting'
import {MobileIcon} from './MobileIcon'

type LocalWork=Awaited<ReturnType<typeof localVisitWork>>
export type VisitContextState={invoices?:VisitSource<VisitInvoice>;invoiceError?:string;visits?:VisitSource<RecordedVisit>;visitError?:string;local?:LocalWork;localError?:string}
const fail=(e:unknown)=>e instanceof Error?e.message:String(e)
const date=(value:string)=>Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Baghdad',dateStyle:'medium'}).format(new Date(value)):'Date unavailable'
export function VisitWorkspace({retail,ownerId,version,onOrder,onSurvey,paymentsOnly=false}:{retail:Outlet;ownerId:string;version:number;onOrder:()=>void;onSurvey:()=>void;paymentsOnly?:boolean}){
 const key=ownerId+':'+retail.id+':'+version
 const [state,setState]=useState<VisitContextState&{key:string}>({key})
 const [clock,setClock]=useState(Date.now)
 useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),60000);return()=>clearInterval(timer)},[])
 useEffect(()=>{let active=true
  const update=(value:Partial<VisitContextState>)=>{if(active)setState(s=>({... (s.key===key?s:{key}),...value}))}
  void visitRows<VisitInvoice>(db,supabase,ownerId,retail.id,'solo_invoice_balances','id,invoice_no,outlet_id,created_at,total,outstanding,due_date').then(invoices=>update({invoices}),e=>update({invoiceError:fail(e)}))
  void visitRows<RecordedVisit>(db,supabase,ownerId,retail.id,'visits','id,outlet_id,checked_in_at,checked_out_at').then(visits=>update({visits}),e=>update({visitError:fail(e)}))
  const subscription=liveQuery(()=>localVisitWork(db,ownerId,retail.id)).subscribe({next:local=>update({local}),error:e=>update({localError:fail(e)})})
  return()=>{active=false;subscription.unsubscribe()}
 },[key,ownerId,retail.id])
 return <VisitWorkspaceView retail={retail} state={state.key===key?state:{}} at={new Date(clock)} onOrder={onOrder} onSurvey={onSurvey} paymentsOnly={paymentsOnly}/>
}
export function VisitWorkspaceView({retail,state,at,onOrder,onSurvey,paymentsOnly=false}:{retail:Outlet;state:VisitContextState;at:Date;onOrder:()=>void;onSurvey:()=>void;paymentsOnly?:boolean}){
 let payments:ReturnType<typeof visitPayments>|undefined,paymentError=state.invoiceError,last:RecordedVisit|undefined,visitError=state.visitError
 try{if(state.invoices)payments=visitPayments(state.invoices.rows,retail.id,at)}catch(e){paymentError=fail(e)}
 try{if(state.visits)last=lastCompletedVisit(state.visits.rows,retail.id)}catch(e){visitError=fail(e)}
 const pending=state.local?.pendingOrder||state.local?.hasOrder
 return <div className="visit-workspace"><RetailTag {...retailReference(retail.id,[retail])}/>
 {!paymentsOnly&&<><section className="visit-prepare"><p className="visit-eyebrow">PREPARE FOR YOUR VISIT</p><h2>Everything you need before you start.</h2><p>Review this customer, pick up saved work, and capture your next order or survey.</p><div className="visit-main-actions"><button className="primary" onClick={onOrder}><MobileIcon name="cart" size={20}/>{pending?'Continue order':'Take an order'}</button><button onClick={onSurvey}><MobileIcon name="chart" size={20}/>Fill a survey</button></div></section>
 <section className="card visit-readiness"><h2>On this device</h2>{state.localError?<p className="error" role="alert">{state.localError}</p>:!state.local?<p role="status">Checking saved work…</p>:<><p className="visit-local-status">{state.local.session?(state.local.session.finish_requested?'Visit finish waiting for upload':'An unfinished visit is saved here'):'No unfinished visit on this device'}</p>{state.local.pendingOrder?<button className="visit-resume" onClick={onOrder}>Order awaiting confirmation · open saved order →</button>:state.local.hasOrder&&<button className="visit-resume" onClick={onOrder}>Saved order draft · continue →</button>}{state.local.drafts.length>0&&<button className="visit-resume" onClick={onSurvey}>{state.local.drafts.length} survey draft(s) to complete or review →</button>}<p className="muted">{state.local.forms===undefined?'Survey reference not cached yet. Sync to load published forms.':state.local.forms===0?'No published survey forms are cached.':`${state.local.forms} published form version(s) available on this device.`}</p><p className="muted">Local work stays on this device until confirmed by the server.</p></>}</section>
 <section className="card visit-customer-brief"><div><span>Customer contact</span><strong>{retail.owner_name||'Name not recorded'}</strong>{retail.owner_phone?<a href={'tel:'+retail.owner_phone}>{retail.owner_phone}</a>:<p className="muted">Phone not recorded</p>}</div><div><span>Last confirmed visit</span>{visitError?<p role="status">History unavailable. Sync and retry.</p>:!state.visits?<p role="status">Loading history…</p>:<><strong>{last?date(last.checked_out_at!):'No completed visit recorded'}</strong><small>Confirmed records · {date(state.visits.at)}</small></>}</div></section></>}
 <section className="card visit-payments"><div className="section-heading"><h2>Pending payments</h2>{payments&&<span className="tag">{payments.pending.length} unpaid</span>}</div>{paymentError?<p className="error" role="alert">{paymentError}</p>:!payments?<p role="status">Loading invoice balances…</p>:<><dl className="metrics"><div><dt>Outstanding · USD</dt><dd>{formatUsd(payments.outstanding)}</dd></div><div><dt>Overdue · USD</dt><dd>{formatUsd(payments.overdue)}</dd></div></dl><p className="muted">Saved balance snapshot · {date(state.invoices!.at)}. Sync before relying on it for collection.</p>{payments.pending.length?<ul className="visit-invoice-list">{payments.pending.slice(0,paymentsOnly?payments.pending.length:3).map(i=><li key={i.id}><Link to={'/orders?invoice='+i.id}><span><strong>Invoice #{i.invoice_no}</strong><small>{!i.due_date?'Due date unavailable':i.due_date<baghdadDay(at)?'Overdue · '+date(i.due_date+'T12:00:00Z'):'Due '+date(i.due_date+'T12:00:00Z')}</small></span><strong>{formatUsd(i.outstanding)}</strong><span aria-hidden="true">›</span></Link></li>)}</ul>:<p className="muted">No unpaid invoices in this snapshot.</p>}{!paymentsOnly&&payments.pending.length>3&&<details><summary>Show {payments.pending.length-3} more unpaid invoices</summary><ul className="visit-invoice-list">{payments.pending.slice(3).map(i=><li key={i.id}><Link to={'/orders?invoice='+i.id}>Invoice #{i.invoice_no}<strong>{formatUsd(i.outstanding)}</strong></Link></li>)}</ul></details>}{payments.unknown>0&&<p className="warn-text">{payments.unknown} unpaid invoice(s) have no due date; they are not classified as overdue.</p>}<p className="muted">Open an invoice to review its details. Payment posting and reminders keep their existing workflow.</p></>}</section>
 {!paymentsOnly&&<section className="card visit-recent"><h2>Recent invoices</h2>{paymentError?<p role="status">Invoice history unavailable.</p>:!state.invoices?<p role="status">Loading invoices…</p>:!state.invoices.rows.length?<p className="muted">No issued invoices in this snapshot.</p>:<ul className="visit-invoice-list">{[...state.invoices.rows].sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)).slice(0,3).map(i=><li key={i.id}><Link to={'/orders?invoice='+i.id}><span><strong>Invoice #{i.invoice_no}</strong><small>{date(i.created_at)}</small></span><strong>{formatUsd(i.total)}</strong><span aria-hidden="true">›</span></Link></li>)}</ul>}</section>}
 </div>
}
