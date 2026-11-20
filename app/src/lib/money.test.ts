import { describe, expect, it } from 'vitest'
import { formatUsd, localToUsd, multiplyUsd, sumUsd, usdCents } from './money'

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
