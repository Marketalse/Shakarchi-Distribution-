import{describe,it,expect}from'vitest'
import{retailReference,invoiceRetailReference,paymentRetailReference,retailReferenceText}from'./retail-reference'
const retails=[{id:'a',retail_name:'اسواق السلام',area:'الكرادة',province:'بغداد'},{id:'b',retail_name:'اسواق السلام',area:'المنصور',province:'بغداد'},{id:'c',retail_name:'Unique Market'}]
describe('retail display references',()=>{
 it('preserves Arabic display and distinguishes duplicate names by location',()=>{expect(retailReference('a',retails)).toEqual({name:'اسواق السلام',detail:'الكرادة · بغداد'});expect(retailReferenceText(retailReference('b',retails))).toBe('اسواق السلام · المنصور · بغداد')})
 it('uses current retail identity for operational records without mutating historical snapshots',()=>{const invoice={id:'invoice',outlet_id:'c',recipient_snapshot:{name:'Old Market'}};expect(invoiceRetailReference(invoice,retails).name).toBe('Unique Market');expect(invoice.recipient_snapshot.name).toBe('Old Market')})
 it('uses the historical name only when the current retail is unavailable',()=>{expect(invoiceRetailReference({outlet_id:'gone',recipient_snapshot:{name:'Historical Market'}},retails).name).toBe('Historical Market')})
 it('does not expose internal IDs as name fallbacks',()=>{expect(retailReference('unknown',retails,'00000000-0000-0000-0000-000000000001').name).toBe('Retail unavailable')})
 it('attributes receipts, refunds and corrections through their existing invoice identity',()=>{for(const entry_type of ['receipt','refund','correction'])expect(paymentRetailReference({order_id:'invoice',outlet_id:'c',...{entry_type}},[{id:'invoice',outlet_id:'c'}],retails).name).toBe('Unique Market')})
 it('uses retail identity on an unallocated cash entry without inventing an invoice',()=>{expect(paymentRetailReference({outlet_id:'c',order_id:null},[],retails).name).toBe('Unique Market')})
 it('flags conflicting payment and invoice identity instead of assigning another retailer',()=>{expect(paymentRetailReference({order_id:'invoice',outlet_id:'a'},[{id:'invoice',outlet_id:'b'}],retails).name).toBe('Retail reference needs review')})
 it('does not collapse same-name records into a shared identifier',()=>{const refs=retails.slice(0,2).map(r=>retailReferenceText(retailReference(r.id,retails)));expect(new Set(refs).size).toBe(2);expect(retails[0].id).toBe('a');expect(retails[1].id).toBe('b')})
})
