import { useEffect, useState } from 'react'
import type { DemoUser } from '@app/shared'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createApi } from '@/lib/api'
import { saveUser } from '@/lib/session'

export function LoginPage({ onLogin }: { onLogin: (u: DemoUser) => void }) {
  const [users, setUsers] = useState<DemoUser[]>([])
  const [selectedId, setSelectedId] = useState('')

  useEffect(() => {
    let cancelled = false
    createApi(null)
      .users()
      .then((u) => {
        if (!cancelled) setUsers(u)
      })
      .catch((e: unknown) => {
        if (!cancelled) toast.error(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [])

  function signIn() {
    const u = users.find((x) => x.id === selectedId)
    if (!u) return
    saveUser(u)
    onLogin(u)
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 rounded-lg border bg-card p-6 text-card-foreground">
        <h1 className="text-2xl font-semibold">Expense Reports</h1>
        <p className="text-sm text-muted-foreground">Demo: choose who to sign in as</p>
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger className="w-full" aria-label="User">
            <SelectValue placeholder="Select a user" />
          </SelectTrigger>
          <SelectContent>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name} — {u.role}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button className="w-full" disabled={!selectedId} onClick={signIn}>
          Sign in
        </Button>
      </div>
    </div>
  )
}
