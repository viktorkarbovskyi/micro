import { describe, expect, it } from 'vitest'
import { centsToInput, formatAmount, parseAmountToCents } from '../src/lib/money'

describe('parseAmountToCents', () => {
  it.each([
    ['19.99', 1999],
    ['23,5', 2350],
    ['100', 10000],
    ['0.10', 10],
    ['-5', -500],
    ['0', 0],
    [' 7.5 ', 750],
    ['-0.5', -50],
  ])('parses %j to %d', (input, cents) => {
    expect(parseAmountToCents(input)).toBe(cents)
  })

  it.each(['-0', '-0.00'])('returns +0 for %j', (input) => {
    expect(Object.is(parseAmountToCents(input), 0)).toBe(true)
  })

  it.each(['1.005', 'abc', '', '1.2.3', '1.', '.5'])('rejects %j', (input) => {
    expect(parseAmountToCents(input)).toBeNull()
  })
})

describe('formatAmount', () => {
  it('formats with thousands separators', () => {
    expect(formatAmount(123456, 'USD')).toBe('1,234.56 USD')
  })
  it('pads small amounts', () => {
    expect(formatAmount(5, 'EUR')).toBe('0.05 EUR')
  })
  it('handles MAX_SAFE_INTEGER without float math', () => {
    expect(formatAmount(9007199254740991, 'UAH')).toBe('90,071,992,547,409.91 UAH')
  })
  it('handles negatives', () => {
    expect(formatAmount(-150, 'USD')).toBe('-1.50 USD')
  })
})

describe('centsToInput', () => {
  it.each([
    [123456, '1234.56'],
    [1999, '19.99'],
    [5, '0.05'],
    [0, '0.00'],
    [-150, '-1.50'],
    [9007199254740991, '90071992547409.91'],
  ])('formats %d as %j', (cents, text) => {
    expect(centsToInput(cents)).toBe(text)
  })

  it('round-trips through parseAmountToCents', () => {
    for (const c of [0, 1, 99, 100, 2350, 123456, -50]) expect(parseAmountToCents(centsToInput(c))).toBe(c)
  })
})
