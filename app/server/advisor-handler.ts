/// <reference types="node" />
import {createClient} from '@supabase/supabase-js'
import {getVercelOidcToken} from '@vercel/oidc'
import {env} from 'node:process'
import {advisorSignals,advisorSnapshot,validateAdvisorChoice,type AdvisorSource} from '../src/lib/advisor.js'
import type {SupabaseClient} from '@supabase/supabase-js'
class AdvisorConnectionError extends Error { code:string; constructor(code:string){super(code);this.code=code} }
const MODEL='openai/gpt-4.1-mini'
const headers={'Cache-Control':'no-store, private','Content-Type':'application/json','Vary':'Authorization','X-Content-Type-Options':'nosniff'}
const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers})
const recent=new Map<string,number>()
export type AdvisorDependencies={enabled:()=>boolean;authorize:(token:string)=>Promise<{id:string;client:SupabaseClient}|null>;load:(client:SupabaseClient)=>Promise<AdvisorSource>;choose:(signals:ReturnType<typeof advisorSignals>)=>Promise<unknown>;now:()=>Date;allow:(id:string)=>boolean}
async function rows<T>(client:SupabaseClient,table:string,columns:string,key='id'):Promise<T[]>{
 const all:T[]=[]
 for(let offset=0;offset<10000;offset+=500){
  const {data,error}=await client.from(table).select(columns).order(key).range(offset,offset+499)
  if(error)throw Error('Source unavailable.')
  all.push(...data as T[])
  if(data.length<500)return all
 }
 throw Error('Source exceeds pilot coverage. Advice withheld.')
}
export const dependencies:AdvisorDependencies={
 enabled:()=>env.ADVISOR_ENABLED==='true',
 now:()=>new Date(),
 allow(id){const now=Date.now();for(const [key,at]of recent)if(now-at>60000)recent.delete(key);if(recent.has(id))return false;recent.set(id,now);return true},
 async authorize(token){
  const url=env.VITE_SUPABASE_URL,key=env.VITE_SUPABASE_PUBLISHABLE_KEY
  if(!url||!key)throw Error('Configuration unavailable.')
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:'Bearer '+token},fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(10000)})}})
  const {data,error}=await client.auth.getUser(token)
  if(error||!data.user)return null
  const profile=await client.from('profiles').select('id,role,active').eq('id',data.user.id).single()
  return !profile.error&&profile.data?.role==='owner'&&profile.data.active===true?{id:data.user.id,client}:null
 },
 async load(client){
  const [invoices,cash,reminders,orders,lines]=await Promise.all([
   rows<AdvisorSource['invoices'][number]>(client,'solo_invoice_balances','id,invoice_no,outlet_id,total,collected,outstanding,overpayment,due_date,payment_status,created_at'),
   rows<AdvisorSource['cash'][number]>(client,'payments','id,order_id,amount'),
   rows<AdvisorSource['reminders'][number]>(client,'collection_reminders','order_id,status,scheduled_at','order_id'),
   rows<AdvisorSource['orders'][number]>(client,'orders','id,currency'),
   rows<AdvisorSource['lines'][number]>(client,'order_lines','id,order_id,line_total,currency')])
  return {invoices,cash,reminders,orders,lines}
 },
 async choose(signals){
  let token:string;try{token=await getVercelOidcToken()}catch{throw new AdvisorConnectionError('deployment_identity_unavailable')}
  const response=await fetch('https://ai-gateway.vercel.sh/v1/chat/completions',{method:'POST',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({
   model:MODEL,temperature:0,max_tokens:150,
   messages:[{role:'system',content:'Select up to three collection review priorities from these anonymous signals. Prefer overdue, then reminder_due, then upcoming; within a class prefer lower balanceRank (larger outstanding balance). Only return candidate IDs. Do not generate advice, numbers, SQL, messages or tool calls.'},{role:'user',content:JSON.stringify(signals)}],
   response_format:{type:'json_schema',json_schema:{name:'collection_priorities',strict:true,schema:{type:'object',properties:{selected:{type:'array',items:{type:'string'},maxItems:3}},required:['selected'],additionalProperties:false}}}
  })})
  if(!response.ok){
   const body=await response.json().catch(()=>({}))
   const reported=String(body?.error?.code??body?.error?.type??'')
   const known=['customer_verification_required','insufficient_credits','insufficient_funds','invalid_api_key','model_not_found','rate_limit_exceeded']
   const code=known.includes(reported)?reported:'gateway_http_'+response.status
   console.warn('advisor_connection_failure',code)
   throw new AdvisorConnectionError(code)
  }
  const result=await response.json()
  if(result.choices?.[0]?.finish_reason!=='stop'||result.choices?.[0]?.message?.tool_calls)throw Error('AI did not return a complete supported answer.')
  return JSON.parse(result.choices[0].message.content)
 }
}
const synthetic:AdvisorSource={orders:[{id:'synthetic',currency:'USD'}],lines:[{id:'line',order_id:'synthetic',line_total:'10.00',currency:'USD'}],cash:[],reminders:[],invoices:[{id:'synthetic',invoice_no:1,outlet_id:'synthetic',created_at:'2020-01-01T00:00:00Z',due_date:'2020-01-02',total:'10.00',collected:'0.00',outstanding:'10.00',overpayment:'0.00',payment_status:'Unpaid'}]}
export async function handleAdvisor(request:Request,deps:AdvisorDependencies=dependencies):Promise<Response>{
 if(!deps.enabled())return reply(404,{error:'Advisor is not enabled on this deployment.'})
 if(request.method!=='POST')return reply(405,{error:'Use POST.'})
 const origin=request.headers.get('origin')
 if(origin&&origin!==new URL(request.url).origin)return reply(403,{error:'Use the Admin website.'})
 const bearer=request.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/)?.[1]
 if(!bearer)return reply(401,{error:'Sign in as the owner.'})
 try{
  const owner=await deps.authorize(bearer)
  if(!owner)return reply(403,{error:'Owner access required.'})
  const text=await request.text()
  if(text.length>256)return reply(413,{error:'Request too large.'})
  let body:unknown;try{body=JSON.parse(text)}catch{return reply(400,{error:'Invalid request.'})}
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['mode','consent'].includes(k)))return reply(400,{error:'Unsupported request.'})
  const {mode,consent}=body as {mode?:unknown;consent?:unknown}
  if(!['snapshot','test','brief'].includes(String(mode)))return reply(400,{error:'Unsupported request.'})
  if(mode==='brief'&&consent!==true)return reply(400,{error:'Confirm anonymous signal sharing before generating.'})
  if(mode!=='snapshot'&&!deps.allow(owner.id))return reply(429,{error:'Wait one minute before another AI request.'})
  const snapshot=advisorSnapshot(mode==='test'?synthetic:await deps.load(owner.client),deps.now())
  if(mode==='snapshot')return reply(200,{snapshot,ai:false})
  if(!snapshot.candidates.length)return reply(200,{snapshot,selected:[],ai:false,message:'No eligible collection priorities. No AI call was made.'})
  try{
   const selected=validateAdvisorChoice(await deps.choose(advisorSignals(snapshot)),snapshot)
   return reply(200,{...(mode==='test'?{}:{snapshot,selected}),ai:true,model:MODEL,message:mode==='test'?'AI connection passed using synthetic records only.':'AI priorities selected from verified sources.'})
  }catch(error){
   const code=error instanceof AdvisorConnectionError?error.code:'unsupported_or_unavailable_response'
   const detail=code==='customer_verification_required'?'Vercel AI Gateway requires account verification.':code==='deployment_identity_unavailable'?'The deployment identity is unavailable.':code==='insufficient_credits'||code==='insufficient_funds'?'AI Gateway has insufficient credits.':'AI is unavailable or returned an unsupported answer.'
   return reply(503,{error:detail+' Check AI Gateway configuration in Vercel, then retry manually. No records were changed.',connectionCode:code,...(mode==='test'?{}:{snapshot}),ai:false})
  }
 }catch{return reply(409,{error:'Source or access verification failed. Refresh and reconcile invoice/payment evidence before advice.',ai:false})}
}
