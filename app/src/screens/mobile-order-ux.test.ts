// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import {act,createElement as h} from 'react'
import {createRoot,type Root} from 'react-dom/client'
import {MemoryRouter,Routes,Route} from 'react-router-dom'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
import {db} from '../lib/db'
import {bindWorkspaceOwner} from '../lib/capture-store'
const mock=vi.hoisted(()=>({issue:vi.fn()}))
vi.mock('../lib/supabase',()=>({supabase:{}}))
vi.mock('../lib/solo-api',()=>({soloApi:()=>({issueInvoice:mock.issue})}))
vi.mock('../lib/catalog',()=>({fieldCatalog:async()=>[{id:'sku-1',brand:'TEST',product_line:'Test DTL',flavour:'Fixture product',selling_price:6.4,items_per_half_pack:5,packs_per_box:10}]}))
vi.mock('./InvoicePdfActions',()=>({InvoicePdfActions:()=>h('span',null,'PDF actions')}))
vi.mock('./CaptureForms',()=>({DynamicSurvey:()=>h('div',null,'Survey handoff')}))
import {RetailDetail} from './BasicRetail'
const owner='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',outlet='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
let host:HTMLDivElement,root:Root
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
const tick=async()=>{await act(async()=>{await new Promise(r=>setTimeout(r,25))})}
function render(version=0){return h(MemoryRouter,{initialEntries:[`/retails/${outlet}?action=order`]},h(Routes,null,h(Route,{path:'/retails/:outletId',element:h(RetailDetail,{version,ownerId:owner,onCaptureChanged:()=>{},onSyncRequested:async()=>{}})})))}
const button=(label:string)=>[...host.querySelectorAll('button')].find(x=>x.textContent===label)!
async function click(element:HTMLElement){await act(async()=>element.click());await tick()}
beforeEach(async()=>{await db.delete();await db.open();await bindWorkspaceOwner(db,owner);await db.outlets.put({id:outlet,retail_name:'Fixture client',assigned_rep:owner,area:'Fixture',province:'Test',outlet_type:'test',lat:33,lng:44}as never);host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root.render(render()));await tick();await tick()})
afterEach(async()=>{await act(async()=>root.unmount());host.remove();await db.delete();mock.issue.mockReset()})
it('keeps the mounted card and quantity across repeated background refreshes',async()=>{const increase=host.querySelector('[aria-label="Increase Fixture product"]')as HTMLElement;expect(increase).toBeTruthy();await click(increase);const card=host.querySelector('.sku-row');expect(host.querySelector('output')?.textContent).toBe('½ Pack');for(let version=1;version<=3;version++){await act(async()=>root.render(render(version)));await tick();expect(host.querySelector('.sku-row')).toBe(card);expect(host.querySelector('output')?.textContent).toBe('½ Pack');expect(host.textContent).not.toContain('Retail details are unavailable')}})
it('confirms once when a background acknowledgment wins the direct response and opens survey',async()=>{let resolve!:(v:unknown)=>void;mock.issue.mockImplementation(()=>new Promise(r=>resolve=r));await click(host.querySelector('[aria-label="Increase Fixture product"]')as HTMLElement);await click([...host.querySelectorAll('button')].find(b=>b.textContent?.startsWith('View Cart'))!);const submit=button('Submit and create invoice');expect(submit).toBeTruthy();await act(async()=>submit.closest('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));await tick();expect(host.textContent).toContain('Waiting for server confirmation');expect(host.textContent).not.toContain('Thank you!');const id=mock.issue.mock.calls[0][0].id;await act(async()=>{await db.local_meta.put({key:'command-result:'+id,value:JSON.stringify({owner_id:owner,result:{order_id:'invoice-1',invoice_no:101}})})});await tick();await tick();expect(host.textContent).toContain('Thank you! Order #101 submitted.');expect(host.textContent).toContain('Survey handoff');expect(host.querySelector('.sku-row')).toBeNull();await act(async()=>resolve({order_id:'invoice-1',invoice_no:101}));await tick();expect(host.querySelectorAll('.order-confirmation').length).toBe(1);expect(await db.local_meta.get(`order-pending:${owner}:${outlet}`)).toBeUndefined()})
