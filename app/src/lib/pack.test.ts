import {expect,it} from 'vitest'
import {packTotal,packBreakdown} from './pack'
it('prices Half Pack, Pack and Box from per-item cents with SKU exceptions',()=>{
 expect(packTotal('1.99',5,0.5)).toBe('9.95');expect(packTotal('1.99',5,1)).toBe('19.90');expect(packTotal('1.99',5,10)).toBe('199.00');expect(packTotal('1.99',6,0.5)).toBe('11.94');expect(()=>packTotal('1.99',5,0.25)).toThrow();
})

it('rolls display at SKU box size in both directions without changing the quantity',()=>{
 const cases:[[number,string],...[number,string][]]=[[0,'0 Packs'],[0.5,'½ Pack'],[1,'1 Pack'],[9.5,'9 Packs · ½ Pack'],[10,'1 Box'],[10.5,'1 Box · ½ Pack'],[11,'1 Box · 1 Pack'],[12.5,'1 Box · 2 Packs · ½ Pack'],[20,'2 Boxes']];for(const [quantity,label] of cases)expect(packBreakdown(quantity,10)).toBe(label);expect(packBreakdown(10-0.5,10)).toBe('9 Packs · ½ Pack');expect(packBreakdown(6.5,6)).toBe('1 Box · ½ Pack');expect(()=>packBreakdown(0.25,10)).toThrow()
})
