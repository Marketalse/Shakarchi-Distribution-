import {it,expect,vi} from 'vitest'
import type {SupabaseClient} from '@supabase/supabase-js'
import {verifySyncOwner} from './sync-access'
it('blocks expired identity, account switches and failed owner lookups before uploads',async()=>{
 const result=vi.fn(async()=>({data:{id:'owner'},error:null} as {data:{id:string}|null;error:unknown}));
 const user=vi.fn(async()=>({data:{user:{id:'owner'}},error:null} as {data:{user:{id:string}|null};error:unknown}));
 const client={auth:{getUser:user},from:()=>({select:()=>({eq:()=>({maybeSingle:result})})})} as unknown as SupabaseClient;
 await verifySyncOwner(client,'owner');user.mockResolvedValueOnce({data:{user:null},error:Error('expired')});await expect(verifySyncOwner(client,'owner')).rejects.toThrow('original owner');user.mockResolvedValueOnce({data:{user:{id:'other'}},error:null});await expect(verifySyncOwner(client,'owner')).rejects.toThrow('original owner');result.mockResolvedValueOnce({data:null,error:Error('network')});await expect(verifySyncOwner(client,'owner')).rejects.toThrow('retained');result.mockResolvedValueOnce({data:null,error:null});await expect(verifySyncOwner(client,'owner')).rejects.toThrow('retained');
})
