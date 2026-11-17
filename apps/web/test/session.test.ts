import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearUser, loadUser, saveUser } from '../src/lib/session'

const user = { id: 'u1', name: 'Harry', role: 'employee' } as const

afterEach(() => vi.unstubAllGlobals())

describe('session', () => {
  it('is a no-op without localStorage', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(loadUser()).toBeNull()
    expect(() => saveUser(user)).not.toThrow()
    expect(() => clearUser()).not.toThrow()
  })

  it('round-trips through localStorage', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    })
    saveUser(user)
    expect(store.has('expense-demo-user')).toBe(true)
    expect(loadUser()).toEqual(user)
    clearUser()
    expect(loadUser()).toBeNull()
  })

  it('returns null for corrupt or invalid data and survives throwing storage', () => {
    vi.stubGlobal('localStorage', { getItem: () => '{oops', setItem: () => { throw new Error('x') }, removeItem: () => { throw new Error('x') } })
    expect(loadUser()).toBeNull()
    expect(() => saveUser(user)).not.toThrow()
    expect(() => clearUser()).not.toThrow()
    vi.stubGlobal('localStorage', { getItem: () => '{"id":1}' })
    expect(loadUser()).toBeNull()
  })
})
