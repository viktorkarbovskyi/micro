import type { AuditEvent, DemoUser, Problem, Report, State } from '@app/shared'
import { buildReportQuery, type Filters } from './filters'

export class ApiProblem extends Error {
  status: number
  code: string
  detail: string
  constructor(status: number, code: string, detail: string) {
    super(`${status} ${code} — ${detail}`)
    this.name = 'ApiProblem'
    this.status = status
    this.code = code
    this.detail = detail
  }
}

export function createApi(user: DemoUser | null) {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {}
    if (user) {
      headers['X-User-Id'] = user.id
      headers['X-User-Role'] = user.role
    }
    const init: RequestInit = { method, headers }
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
      init.body = JSON.stringify(body)
    }
    const res = await fetch(`/api${path}`, init)
    if (!res.ok) {
      let p: Partial<Problem> | null = null
      try {
        p = await res.json()
      } catch {
        p = null
      }
      throw new ApiProblem(
        res.status,
        typeof p?.code === 'string' ? p.code : `HTTP_${res.status}`,
        typeof p?.detail === 'string' ? p.detail : res.statusText,
      )
    }
    if (res.status === 204) return undefined as T
    return (await res.json()) as T
  }

  return {
    users: async () => (await request<{ users: DemoUser[] }>('GET', '/users')).users,
    currencies: () => request<{ currencies: string[]; default: string }>('GET', '/currencies'),
    list: async (f: Filters) => {
      const qs = buildReportQuery(f).toString()
      return (await request<{ reports: Report[] }>('GET', `/reports${qs ? `?${qs}` : ''}`)).reports
    },
    audit: async (id: string) =>
      (await request<{ events: AuditEvent[] }>('GET', `/reports/${encodeURIComponent(id)}/audit`)).events,
    create: (b: { title: string; amountCents: number; currency: string }) =>
      request<Report>('POST', '/reports', b),
    patch: (id: string, b: { title?: string; amountCents?: number }) =>
      request<Report>('PATCH', `/reports/${encodeURIComponent(id)}`, b),
    transition: (id: string, to: State, note?: string) =>
      request<Report>('POST', `/reports/${encodeURIComponent(id)}/transition`, note ? { to, note } : { to }),
    adminReset: () => request<void>('POST', '/admin/reset'),
  }
}

export type Api = ReturnType<typeof createApi>
