import { describe, expect, it } from 'vitest'
import { formatUsd, formatUsdSummary, formatIqdRate, formatIqdAmount, localToUsd, usdToIqd, multiplyUsd, sumUsd, usdCents } from './money'

describe('USD arithmetic and parallel settlement previews', () => {
  it('keeps cents exact across quantities and aggregation', () => {
    expect(sumUsd(['0.10', '0.20'])).toBe('0.30')
    expect(multiplyUsd('6.40', 3)).toBe('19.20')
    expect(formatUsd('-1234.50')).toBe('-$1,234.50')
  })
  it('rounds once at USD settlement and respects rate direction', () => {
    expect(localToUsd('60000', '1500')).toBe('40.00')
    expect(localToUsd('16000', '1600')).toBe('10.00')
    expect(localToUsd('1', '200')).toBe('0.01')
  })
  it('rejects invalid precision and undefined rates', () => {
    expect(() => usdCents('0.001')).toThrow()
    expect(() => localToUsd('100', '0')).toThrow()
    expect(() => usdCents('NaN')).toThrow()
  })
})

it('rounds summaries only and preserves exact ledger cents and rate digits',()=>{
 expect(formatUsdSummary('1234.05')).toBe('$1,234.1')
 expect(formatUsdSummary('-1.05')).toBe('-$1.1')
 expect(formatUsd('0.04')).toBe('$0.04')
 expect(usdCents('1234.05')).toBe(123405n)
 expect(formatIqdRate('1700.25000000')).toBe('$1 = 1,700.25 IQD')
 expect(usdToIqd('12.34','1500')).toBe('18510.00')
 expect(usdToIqd('0.01','1500.555')).toBe('15.01')
 expect(usdToIqd('999999999999.99','1700.25000000')).toBe('1700249999999983.00')
 expect(formatIqdAmount('18510.00')).toBe('18,510.00 IQD')
})
