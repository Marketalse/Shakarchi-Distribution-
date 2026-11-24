// @vitest-environment jsdom
import {act,createElement as h}from'react'
import{createRoot}from'react-dom/client'
import{it,expect,vi}from'vitest'
const mocks=vi.hoisted(()=>({navigate:vi.fn(),signin:vi.fn(async()=>({error:null}))}))
vi.mock('react-router-dom',()=>({useNavigate:()=>mocks.navigate}))
vi.mock('../lib/supabase',()=>({supabase:{auth:{signInWithPassword:mocks.signin}}}))
vi.mock('./LoginAnimation',()=>({LoginAnimation:()=>null}))
import{Login}from'./Login'
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
it('lands mobile sign-in on Home while preserving Admin deep links',async()=>{for(const landing of ['/dashboard',null]){mocks.navigate.mockClear();const host=document.createElement('div'),root=createRoot(host);document.body.append(host);await act(async()=>root.render(h<{landing?:string|null}>(Login,{landing})));await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));if(landing)expect(mocks.navigate).toHaveBeenCalledWith('/dashboard',{replace:true});else expect(mocks.navigate).not.toHaveBeenCalled();await act(async()=>root.unmount());host.remove()}})
