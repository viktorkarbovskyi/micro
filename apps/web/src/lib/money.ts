const AMOUNT_RE = /^\s*(-?\d+)(?:[.,](\d{1,2}))?\s*$/

/** Converts a decimal string to integer minor units without floating-point math. */
export function parseAmountToCents(input: string): number | null {
  const m = AMOUNT_RE.exec(input)
  if (!m) return null
  const negative = m[1].startsWith('-')
  const intPart = negative ? m[1].slice(1) : m[1]
  const cents = Number(intPart + (m[2] ?? '').padEnd(2, '0'))
  if (!Number.isSafeInteger(cents)) return null
  return negative && cents !== 0 ? -cents : cents
}

function splitCents(cents: number): { sign: string; whole: string; fraction: string } {
  const digits = String(Math.abs(cents)).padStart(3, '0')
  return { sign: cents < 0 ? '-' : '', whole: digits.slice(0, -2), fraction: digits.slice(-2) }
}

/** Formats minor units as `1,234.56 USD`, using string arithmetic only. */
export function formatAmount(cents: number, currency: string): string {
  const { sign, whole, fraction } = splitCents(cents)
  return `${sign}${whole.replace(/\B(?=(\d{3})+$)/g, ',')}.${fraction} ${currency}`
}

/** Formats minor units as an editable decimal, `1234.56` (no separators, no currency). */
export function centsToInput(cents: number): string {
  const { sign, whole, fraction } = splitCents(cents)
  return `${sign}${whole}.${fraction}`
}
