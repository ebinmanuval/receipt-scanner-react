// Decimal arithmetic on API money strings. Never parseFloat a total.
import Big from 'big.js'

export function toBig(value: string | null | undefined): Big | null {
  if (value === null || value === undefined) return null
  const s = String(value).trim()
  if (s === '') return null
  try {
    return new Big(s)
  } catch {
    return null
  }
}

/** Sum of decimal strings; invalid entries are skipped. Returns a 2dp string. */
export function sumMoney(values: (string | null | undefined)[]): string {
  return values.reduce<Big>((acc, v) => acc.plus(toBig(v) ?? 0), new Big(0)).toFixed(2)
}

/** a − b as a 2dp string, or null if either is not a number. */
export function diffMoney(a: string | null | undefined, b: string | null | undefined): string | null {
  const x = toBig(a)
  const y = toBig(b)
  if (!x || !y) return null
  return x.minus(y).toFixed(2)
}

/** Numeric equality of two decimal strings ("1" == "1.000"). */
export function sameNumber(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = toBig(a)
  const y = toBig(b)
  if (!x || !y) return (a ?? '').trim() === (b ?? '').trim()
  return x.eq(y)
}

export function isZero(value: string | null | undefined): boolean {
  const x = toBig(value)
  return !!x && x.eq(0)
}

export function isNegative(value: string | null | undefined): boolean {
  const x = toBig(value)
  return !!x && x.lt(0)
}

/** "1.000" → "1", "36.140" → "36.14" for display of quantities. */
export function trimQty(value: string | null | undefined): string {
  const x = toBig(value)
  return x ? x.toString() : (value ?? '')
}
