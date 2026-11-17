import { useEffect, useState } from 'react'
import type { AuditEvent, DemoUser } from '@app/shared'
import type { Api } from '@/lib/api'
import { showError } from '@/lib/notify'
import { parseTimestamp } from '@/lib/time'
import { STATE_BADGES } from '@/lib/ui-config'

interface HistoryListProps {
  reportId: string
  api: Api
  users: DemoUser[]
}

/** ui.md §7.5: audit trail, newest first. */
export function HistoryList({ reportId, api, users }: HistoryListProps) {
  const [events, setEvents] = useState<AuditEvent[] | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .audit(reportId)
      .then((e) => {
        if (!cancelled) setEvents([...e].reverse())
      })
      .catch((e: unknown) => {
        if (!cancelled) showError(e)
      })
    return () => {
      cancelled = true
    }
  }, [api, reportId])

  const names = new Map(users.map((u) => [u.id, u.name]))

  return (
    <section className="space-y-3">
      <h3 className="font-semibold">History</h3>
      {events && (
        <ol className="space-y-3 border-l-2 border-border pl-3">
          {events.map((e) => (
            <li key={e.id} className="space-y-0.5">
              <div className="font-medium">
                {e.from === null ? 'Created' : STATE_BADGES[e.from].label} → {STATE_BADGES[e.to].label}
              </div>
              <div className="text-xs text-muted-foreground">
                {names.get(e.actorId) ?? e.actorId} · {e.role} · {parseTimestamp(e.at).toLocaleString()}
              </div>
              {e.note && <div className="text-sm whitespace-pre-wrap">{e.note}</div>}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
