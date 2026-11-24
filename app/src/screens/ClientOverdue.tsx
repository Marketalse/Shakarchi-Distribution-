import {RetailTag} from './RetailTag'
import {db} from '../lib/db'
import {fieldTable} from '../lib/offline'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { baghdadDay } from '../lib/reporting'
import { formatUsd } from '../lib/money'
import { clientDebt, type ClientBalance } from '../lib/invoice-display'

export function ClientOverdue({outletId,revision=0,admin=false,retailName}:{outletId:string;revision?:number;admin?:boolean;retailName?:string}) {
 const key=outletId+':'+revision
 const [state,setState]=useState<{key:string;rows?:ClientBalance[];today?:string;error?:string}>({key})
 useEffect(()=>{
  let active=true
  async function load(){
   if(!supabase)throw Error('Connect to load invoice balances.')
   const cached=await fieldTable<ClientBalance>(db,'solo_invoice_balances')
   const rows:ClientBalance[]=cached?.filter(r=>r.outlet_id===outletId)??[]
   if(!cached)for(let offset=0;;offset+=500){const {data,error}=await supabase.from('solo_invoice_balances').select('id,invoice_no,outlet_id,due_date,outstanding').eq('outlet_id',outletId).order('id').range(offset,offset+499);if(error)throw error;rows.push(...data as ClientBalance[]);if(data.length<500)break}
   const today=baghdadDay(new Date());clientDebt(rows,outletId,today);if(active)setState({key,rows,today})
  }
  void load().catch(error=>{if(active)setState({key,error:String(error.message || error)})})
  return()=>{active=false}
 },[outletId,key])
 const debt=state.key===key && state.rows && state.today ? clientDebt(state.rows,outletId,state.today):undefined
 return <section className="card client-overdue"><h2>Client payments</h2><RetailTag name={retailName||'Retail unavailable'}/>{state.key===key && state.error ? <p className="error" role="alert">{state.error}</p> : !debt ? <p role="status">Loading balances…</p> : <>
  <dl className="metrics"><div><dt>Overdue · USD</dt><dd>{formatUsd(debt.overdue)}</dd></div><div><dt>Outstanding · USD</dt><dd>{formatUsd(debt.outstanding)}</dd></div></dl>
  {debt.invoices.length ? <ul className="list">{debt.invoices.map(row=><li key={row.id}><Link to={(admin?'/admin/orders':'/orders')+'?invoice='+row.id}><span>Invoice #{row.invoice_no}<small className="muted">Due {row.due_date}</small></span><strong>{formatUsd(row.outstanding)}</strong></Link></li>)}</ul> : <p className="muted">No overdue invoices.</p>}
  {debt.unknown>0 && <p className="warn-text">{debt.unknown} unpaid invoice(s) have no due date.</p>}
 </>}</section>
}
