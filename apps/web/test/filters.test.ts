import { describe, expect, it } from 'vitest'
import { buildReportQuery } from '../src/lib/filters'

describe('buildReportQuery', () => {
  it('omits empty filters', () => {
    expect(buildReportQuery({ q: '', states: [] }).toString()).toBe('')
  })

  it('repeats state', () => {
    const p = buildReportQuery({ q: '', states: ['submitted', 'paid'] })
    expect(p.toString()).toBe('state=submitted&state=paid')
  })

  it('maps q and ownerId', () => {
    const p = buildReportQuery({ q: 'taxi', states: [], ownerId: 'u1' })
    expect(p.get('q')).toBe('taxi')
    expect(p.get('ownerId')).toBe('u1')
  })

  it('converts a local day range to inclusive ISO bounds', () => {
    const day = new Date(2026, 10, 16, 13, 45)
    const p = buildReportQuery({ q: '', states: [], from: day, to: day })
    expect(p.get('createdFrom')).toBe(new Date(2026, 10, 16).toISOString())
    expect(p.get('createdTo')).toBe(new Date(2026, 10, 16, 23, 59, 59, 999).toISOString())
  })
})
