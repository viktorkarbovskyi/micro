import { ROLES, type DemoUser } from '@app/shared'

const KEY = 'expense-demo-user'

export function loadUser(): DemoUser | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const u = JSON.parse(raw)
    if (
      u && typeof u.id === 'string' && typeof u.name === 'string' &&
      (ROLES as readonly string[]).includes(u.role)
    ) {
      return { id: u.id, name: u.name, role: u.role }
    }
  } catch {
    // storage unavailable or corrupt: treat as signed out
  }
  return null
}

export function saveUser(u: DemoUser): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(u))
  } catch {
    // ignore
  }
}

export function clearUser(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
