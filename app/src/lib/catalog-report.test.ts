import {it,expect} from 'vitest'
import {catalogSales} from './catalog-report'
it('reconciles nested historical labels without current-product joins or fan-out',()=>{
 const lines=[{id:'a',order_id:'one',line_total:'9.95',product_snapshot:{brand:'Brand',product_line:'Line',flavour:'Variant'}},{id:'b',order_id:'one',line_total:'1.05',product_snapshot:null}];
 expect(catalogSales(lines,new Set(['one']),'11.00').map(r=>r.total)).toEqual(['9.95','1.05']);expect(()=>catalogSales([...lines,lines[0]],new Set(['one']),'11.00')).toThrow('Duplicate');expect(()=>catalogSales(lines,new Set(['one']),'12.00')).toThrow('reconcile');
})
