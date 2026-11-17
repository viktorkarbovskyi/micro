import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DemoUser, Report } from '@app/shared'
import { AppHeader } from '@/components/AppHeader'
import { EMPTY_FILTERS, Filters } from '@/components/Filters'
import { LoginPage } from '@/components/LoginPage'
import { ResetDialog } from '@/components/ResetDialog'
import { ReportSheet } from '@/components/ReportSheet'
import { ReportsTable } from '@/components/ReportsTable'
import { Toaster } from '@/components/ui/sonner'
import { createApi } from '@/lib/api'
import type { Filters as FiltersState } from '@/lib/filters'
import { showError } from '@/lib/notify'
import { clearUser, loadUser } from '@/lib/session'

export default function App() {
  const [user, setUser] = useState<DemoUser | null>(loadUser)
  const [users, setUsers] = useState<DemoUser[]>([])
  const [filters, setFilters] = useState<FiltersState>(EMPTY_FILTERS)
  const [reports, setReports] = useState<Report[]>([])
  /** False until the first list load finishes, so "No reports yet" is not flashed. */
  const [loaded, setLoaded] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [reloadTick, setReloadTick] = useState(0)

  /** Re-fetches the list with the current filters (called after mutations). */
  const reload = useCallback(() => setReloadTick((n) => n + 1), [])

  const api = useMemo(() => (user ? createApi(user) : null), [user])

  useEffect(() => {
    if (!api) return
    let cancelled = false
    api
      .users()
      .then((u) => {
        if (!cancelled) setUsers(u)
      })
      .catch(showError)
    return () => {
      cancelled = true
    }
  }, [api])

  useEffect(() => {
    if (!api) return
    let cancelled = false
    api
      .list(filters)
      .then((r) => {
        if (cancelled) return
        setReports(r)
        setLoaded(true)
      })
      .catch((e: unknown) => {
        if (!cancelled) showError(e)
      })
    return () => {
      cancelled = true
    }
  }, [api, filters, reloadTick])

  function closeSheet() {
    setSelectedId(null)
    setCreating(false)
  }

  function openCreate() {
    setSelectedId(null)
    setCreating(true)
  }

  /** ui.md §12: after a successful mutation the table reloads and the sidebar closes. */
  function mutationDone() {
    reload()
    closeSheet()
  }

  function resetDone() {
    setResetting(false)
    mutationDone()
  }

  function switchUser() {
    setResetting(false)
    clearUser()
    setUser(null)
    setFilters(EMPTY_FILTERS)
    setReports([])
    setLoaded(false)
    closeSheet()
  }

  const showEmployee = user !== null && user.role !== 'employee'
  const selected = selectedId === null ? undefined : reports.find((r) => r.id === selectedId)

  return (
    <>
      {user && api ? (
        <>
          <AppHeader user={user} onNewReport={openCreate} onReset={() => setResetting(true)} onSwitchUser={switchUser} />
          <main className="space-y-4 p-6">
            <Filters filters={filters} onChange={setFilters} users={users} showEmployee={showEmployee} />
            <ReportsTable
              reports={reports}
              loaded={loaded}
              users={users}
              showEmployee={showEmployee}
              onOpen={setSelectedId}
            />
          </main>
          {resetting && <ResetDialog api={api} onDone={resetDone} onClose={() => setResetting(false)} />}
          {creating && (
            <ReportSheet mode="create" user={user} users={users} api={api} onDone={mutationDone} onClose={closeSheet} />
          )}
          {!creating && selected && (
            <ReportSheet
              key={selected.id}
              mode="view"
              report={selected}
              user={user}
              users={users}
              api={api}
              onDone={mutationDone}
              onClose={closeSheet}
            />
          )}
        </>
      ) : (
        <LoginPage onLogin={setUser} />
      )}
      <Toaster richColors />
    </>
  )
}
