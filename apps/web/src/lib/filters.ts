import type { State } from '@app/shared'

export interface Filters {
  q: string
  states: State[]
  from?: Date
  to?: Date
  ownerId?: string
}

/** Maps UI filters to API query params; empty filters are omitted. */
export function buildReportQuery(f: Filters): URLSearchParams {
  const p = new URLSearchParams()
  if (f.q) p.set('q', f.q)
  for (const s of f.states) p.append('state', s)
  if (f.from) {
    p.set('createdFrom', new Date(f.from.getFullYear(), f.from.getMonth(), f.from.getDate()).toISOString())
  }
  if (f.to) {
    p.set(
      'createdTo',
      new Date(f.to.getFullYear(), f.to.getMonth(), f.to.getDate(), 23, 59, 59, 999).toISOString(),
    )
  }
  if (f.ownerId) p.set('ownerId', f.ownerId)
  return p
}
