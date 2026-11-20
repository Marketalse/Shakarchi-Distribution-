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
