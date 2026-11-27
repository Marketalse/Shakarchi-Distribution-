/** USD pricing uses cents. BigInt keeps previews independent of binary floats. */
export type Usd = string

export function scaledAmount(value: string | number, decimals: number): bigint {
  const text = String(value).trim()
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text)
  if (!match || (match[3]?.length ?? 0) > decimals) throw Error('Enter a valid decimal amount.')
  const units = BigInt(match[2] + (match[3] ?? '').padEnd(decimals, '0'))
  return match[1] ? -units : units
}

export const usdCents = (value: string | number) => scaledAmount(value, 2)

export function usdAmount(cents: bigint): Usd {
  const absolute = cents < 0n ? -cents : cents
  return (cents < 0n ? '-' : '') + absolute / 100n + '.' + String(absolute % 100n).padStart(2, '0')
}

export function sumUsd(values: (string | number)[]): Usd {
  return usdAmount(values.reduce<bigint>((total, value) => total + usdCents(value), 0n))
}

export function multiplyUsd(value: string | number, quantity: number): Usd {
  if (!Number.isSafeInteger(quantity)) throw Error('Enter a whole quantity.')
  return usdAmount(usdCents(value) * BigInt(quantity))
}

export function formatUsd(value: string | number): string {
  const cents = usdCents(value)
  const absolute = cents < 0n ? -cents : cents
  return (cents < 0n ? '-$' : '$') + new Intl.NumberFormat('en-US').format(absolute / 100n) +
    '.' + String(absolute % 100n).padStart(2, '0')
}

/** Rate convention is IQD per USD, with up to eight decimal places. */
export function localToUsd(sourceAmount: string, exchangeRate: string): Usd {
  const local = scaledAmount(sourceAmount, 2)
  const rate = scaledAmount(exchangeRate, 8)
  if (local < 0n || rate <= 0n) throw Error('Use a positive rate and a nonnegative cash amount.')
  const numerator = local * 100000000n
  const cents = numerator / rate
  const remainder = numerator % rate
  return usdAmount(cents + (remainder * 2n >= rate ? 1n : 0n))
}

/** Display-only invoice equivalent using the immutable order-time IQD/USD rate. */
export function usdToIqd(usdAmount: string | number, exchangeRate: string): string {
  const cents = usdCents(usdAmount)
  const rate = scaledAmount(exchangeRate, 8)
  if (cents < 0n || rate <= 0n) throw Error('Use a positive rate and nonnegative USD amount.')
  const numerator = cents * rate
  const units = numerator / 100000000n
  const remainder = numerator % 100000000n
  const rounded = units + (remainder * 2n >= 100000000n ? 1n : 0n)
  return rounded / 100n + '.' + String(rounded % 100n).padStart(2, '0')
}

export function formatIqdAmount(value: string): string {
  const cents = scaledAmount(value, 2)
  const absolute = cents < 0n ? -cents : cents
  return new Intl.NumberFormat('en-US').format(absolute / 100n) + '.' +
    String(absolute % 100n).padStart(2, '0') + ' IQD'
}

/** Display only; canonical amounts and payment entry keep exact cents. */
export function formatUsdSummary(value: string | number): string {
  const cents=usdCents(value), absolute=cents<0n?-cents:cents
  const tenths=(absolute+5n)/10n
  return (cents<0n?'-$':'$')+new Intl.NumberFormat('en-US').format(tenths/10n)+'.'+tenths%10n
}
export function formatIqdRate(value: string | number): string {
  const match=/^(\d+)(?:\.(\d+))?$/.exec(String(value))
  if(!match) return 'Unavailable'
  const fraction=(match[2]??'').replace(/0+$/,'')
  return '$1 = '+new Intl.NumberFormat('en-US').format(BigInt(match[1]))+(fraction?'.'+fraction:'')+' IQD'
}
