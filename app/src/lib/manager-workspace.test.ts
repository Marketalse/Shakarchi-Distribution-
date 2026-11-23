import {describe,it,expect} from 'vitest'
import {managerActivity,managerFocus,managerNavigation} from './manager-workspace'
import type {AdminData} from './admin-data'
const at=new Date('2026-11-23T10:00:00Z')
const data=():AdminData=>({clients:[{id:'client',retail_name:'Example store'} as AdminData['clients'][number]],invoices:[],cash:[],reminders:[],products:[],surveys:[],runs:[],observations:[],visits:[],loadedAt:at.toISOString()})
const invoice=(id:string,due:string|null,outstanding='10.00')=>({id,invoice_no:1,outlet_id:'client',total:'10.00',collected:'0.00',outstanding,overpayment:'0.00',due_date:due,payment_status:'Unpaid',created_at:'2026-11-22T10:00:00Z'})
describe('Manager workspace',()=>{
 it('deduplicates overdue invoices also having due reminders; excludes paid and future due invoices',()=>{const d=data();d.invoices=[invoice('old','2026-11-22'),invoice('paid','2026-11-22','0.00'),invoice('future','2026-11-25')];d.reminders=[{order_id:'old',status:'pending',scheduled_at:'2026-11-22T12:00:00Z'},{order_id:'paid',status:'pending',scheduled_at:'2026-11-22T12:00:00Z'}];expect(managerFocus(d,at).payments.map(i=>i.id)).toEqual(['old'])})
 it('includes a reminder due today independently of overdue date',()=>{const d=data();d.invoices=[invoice('today','2026-11-23')];d.reminders=[{order_id:'today',status:'pending',scheduled_at:'2026-11-23T09:00:00Z'}];expect(managerFocus(d,at).payments).toHaveLength(1)})
 it('shows only unfinished recorded visits, not completed or future starts',()=>{const d=data();d.visits=[{id:'open',outlet_id:'client',checked_in_at:'2026-11-23T08:00:00Z',checked_out_at:null},{id:'done',outlet_id:'client',checked_in_at:'2026-11-23T08:00:00Z',checked_out_at:'2026-11-23T09:00:00Z'},{id:'future',outlet_id:'client',checked_in_at:'2026-11-24T08:00:00Z',checked_out_at:null}];expect(managerFocus(d,at).openVisits.map(v=>v.id)).toEqual(['open'])})
 it('uses Baghdad day boundaries and links invoices without exposing technical IDs as labels',()=>{const d=data();d.invoices=[{...invoice('technical-id',null),created_at:'2026-11-22T21:30:00Z'}];const rows=managerActivity(d,'today',at);expect(rows).toHaveLength(1);expect(rows[0].label).toBe('INV-0001');expect(rows[0].href).toBe('/admin/orders?invoice=technical-id')})
 it('rejects inconsistent activity sources instead of implying zero activity',()=>{const d=data();d.runs=[{id:'run',outlet_id:'unknown',version_id:'v',created_at:at.toISOString(),answers:{}}];expect(()=>managerActivity(d,'all',at)).toThrow('Client and activity records')})
 it('keeps routes unique across modules',()=>{const paths=managerNavigation.flatMap(g=>g.items.map(i=>i[0]));expect(new Set(paths).size).toBe(paths.length);expect(paths).toContain('reports');expect(paths).toContain('activity')})
})
