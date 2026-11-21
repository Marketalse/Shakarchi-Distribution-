import {usdAmount,usdCents} from './money'
export const CREDIT_DAYS = [4,5,6,7,8,9,10] as const
export function validTerms(days: number) { return days === 0 || Number.isInteger(days) && days >= 4 && days <= 10 }
export function checkoutBalance(total: string, collected: string) {
 const amount=usdCents(collected), due=usdCents(total)
 if(amount<0n || amount>due)throw Error('Collected amount must be from zero to the invoice total.')
 return {remaining:usdAmount(due-amount),status:amount===0n?'Unpaid':amount===due?'Paid':'Partially paid'}
}
