import {expect,it} from 'vitest'
import {packTotal} from './pack'
it('prices Half Pack, Pack and Box from per-item cents with SKU exceptions',()=>{
 expect(packTotal('1.99',5,0.5)).toBe('9.95');expect(packTotal('1.99',5,1)).toBe('19.90');expect(packTotal('1.99',5,10)).toBe('199.00');expect(packTotal('1.99',6,0.5)).toBe('11.94');expect(()=>packTotal('1.99',5,0.25)).toThrow();
})
