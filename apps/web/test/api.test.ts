import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiProblem, createApi } from '../src/lib/api'

const user = { id: 'u1', name: 'Harry', role: 'employee' } as const

function mockFetch(res: Response) {
  const fn = vi.fn(async () => res)
  vi.stubGlobal('fetch', fn)
  return fn
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

afterEach(() => vi.unstubAllGlobals())

describe('createApi', () => {
  it('sends identity headers and no Content-Type without body', async () => {
    const f = mockFetch(json({ reports: [] }))
    expect(await createApi(user).list({ q: '', states: ['paid'] })).toEqual([])
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/reports?state=paid')
    const h = init.headers as Record<string, string>
    expect(h['X-User-Id']).toBe('u1')
    expect(h['X-User-Role']).toBe('employee')
    expect(h['Content-Type']).toBeUndefined()
  })

  it('sends JSON body with Content-Type', async () => {
    const f = mockFetch(json({ id: 'r1' }, 201))
    await createApi(user).create({ title: 't', amountCents: 100, currency: 'USD' })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/reports')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body as string)).toEqual({ title: 't', amountCents: 100, currency: 'USD' })
  })

  it('omits an empty note on transition', async () => {
    const f = mockFetch(json({ id: 'r1' }))
    await createApi(user).transition('r1', 'submitted', '')
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/reports/r1/transition')
    expect(JSON.parse(init.body as string)).toEqual({ to: 'submitted' })
  })

  it('unwraps users, audit; adminReset has no body', async () => {
    mockFetch(json({ users: [user] }))
    expect(await createApi(null).users()).toEqual([user])
    mockFetch(json({ events: [{ id: 'e' }] }))
    expect(await createApi(user).audit('r1')).toEqual([{ id: 'e' }])
    const f = mockFetch(new Response(null, { status: 204 }))
    await expect(createApi(user).adminReset()).resolves.toBeUndefined()
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[0]).toBe('/api/admin/reset')
  })

  it('omits identity headers when no user', async () => {
    const f = mockFetch(json({ currencies: ['USD'], default: 'USD' }))
    await createApi(null).currencies()
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect((init.headers as Record<string, string>)['X-User-Id']).toBeUndefined()
  })

  it('throws ApiProblem from problem body', async () => {
    mockFetch(json({ status: 409, code: 'ILLEGAL_TRANSITION', detail: 'nope' }, 409))
    const err = await createApi(user).patch('r1', { title: 'x' }).catch((e) => e)
    expect(err).toBeInstanceOf(ApiProblem)
    expect(err).toMatchObject({ status: 409, code: 'ILLEGAL_TRANSITION', detail: 'nope' })
  })

  it('falls back for non-JSON error bodies', async () => {
    mockFetch(new Response('<html>', { status: 502, statusText: 'Bad Gateway' }))
    const err = await createApi(user).list({ q: '', states: [] }).catch((e) => e)
    expect(err).toMatchObject({ status: 502, code: 'HTTP_502', detail: 'Bad Gateway' })
  })
})
