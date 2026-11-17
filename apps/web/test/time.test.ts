import { describe, expect, it } from 'vitest'
import { parseTimestamp } from '../src/lib/time'

// A non-UTC zone, so that reading an offset-less timestamp as local time would be caught.
process.env.TZ = 'America/New_York'

describe('parseTimestamp', () => {
  it('runs in a non-UTC time zone', () => {
    expect(new Date(2026, 0, 1).getTimezoneOffset()).not.toBe(0)
  })

  it('treats a timestamp without Z or offset as UTC, not local time', () => {
    expect(parseTimestamp('2026-03-01T10:00:00').getTime()).toBe(Date.UTC(2026, 2, 1, 10))
    expect(parseTimestamp('2026-03-01T10:00:00.250').getTime()).toBe(Date.UTC(2026, 2, 1, 10, 0, 0, 250))
    expect(parseTimestamp('2026-03-01T10:00').getTime()).toBe(Date.UTC(2026, 2, 1, 10))
  })

  it('honours Z and explicit offsets', () => {
    expect(parseTimestamp('2026-03-01T10:00:00.000Z').getTime()).toBe(Date.UTC(2026, 2, 1, 10))
    expect(parseTimestamp('2026-03-01T12:00:00+02:00').getTime()).toBe(Date.UTC(2026, 2, 1, 10))
    expect(parseTimestamp('2026-03-01T05:00:00-05:00').getTime()).toBe(Date.UTC(2026, 2, 1, 10))
  })

  it('accepts any fractional precision (truncated to ms) and lowercase t/z, as the API does', () => {
    expect(parseTimestamp('2026-03-01T10:00:00.123456Z').getTime()).toBe(Date.UTC(2026, 2, 1, 10, 0, 0, 123))
    expect(parseTimestamp('2026-03-01T10:00:00.123999').getTime()).toBe(Date.UTC(2026, 2, 1, 10, 0, 0, 123))
    expect(parseTimestamp('2026-03-01t10:00:00z').getTime()).toBe(Date.UTC(2026, 2, 1, 10))
  })
})
