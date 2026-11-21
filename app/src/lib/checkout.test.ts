import {it,expect} from 'vitest'
import {checkoutBalance,validTerms,CREDIT_DAYS} from './checkout'
it('allows Cash or only whole credit days from4through10',()=>{
 expect(CREDIT_DAYS).toEqual([4,5,6,7,8,9,10]);for(const n of [0,...CREDIT_DAYS])expect(validTerms(n)).toBe(true);for(const n of [-1,1,3,4.5,11,14,60,NaN])expect(validTerms(n)).toBe(false)
})
it('zero collection stays unpaid independently of terms; partial/full reconcile exactly',()=>{
 expect(checkoutBalance('19.90','0.0')).toEqual({remaining:'19.90',status:'Unpaid'});expect(checkoutBalance('19.90','9.95')).toEqual({remaining:'9.95',status:'Partially paid'});expect(checkoutBalance('19.90','19.90')).toEqual({remaining:'0.00',status:'Paid'});expect(()=>checkoutBalance('19.90','20')).toThrow();expect(()=>checkoutBalance('19.90','-1')).toThrow()
})
