import { useEffect, useState } from 'react'
import type { DemoUser, Report, State } from '@app/shared'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { HistoryList } from '@/components/HistoryList'
import { StateBadge } from '@/components/StateBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import type { Api } from '@/lib/api'
import { centsToInput, formatAmount, parseAmountToCents } from '@/lib/money'
import { showError } from '@/lib/notify'
import { parseTimestamp } from '@/lib/time'
import { ROLE_BUTTON_GROUPS, ROLE_BUTTONS } from '@/lib/ui-config'

const TRANSITION_TOASTS: Record<State, string> = {
  submitted: 'Report submitted',
  draft: 'Report withdrawn',
  manager_approved: 'Report approved',
  finance_approved: 'Report approved',
  rejected: 'Report rejected',
  paid: 'Report marked as paid',
}

// Presentation only: colors follow the requested target, never the report's state.
function transitionButtonProps(to: State) {
  if (to === 'rejected') return { variant: 'destructive' as const }
  if (to === 'draft') return { variant: 'outline' as const }
  if (to === 'submitted') return { variant: 'default' as const }
  return { variant: 'default' as const, className: 'bg-green-600 text-white hover:bg-green-600/80' }
}

interface ReportSheetProps {
  mode: 'view' | 'create'
  report?: Report
  user: DemoUser
  users: DemoUser[]
  api: Api
  /** Called after a successful mutation (the success toast is already shown): reload the table and close. */
  onDone: () => void
  onClose: () => void
}

/** ui.md §7–§10: one sidebar for viewing, editing and creating a report. */
export function ReportSheet({ mode, report, user, users, api, onDone, onClose }: ReportSheetProps) {
  const [busy, setBusy] = useState(false)

  /** §12: success → toast + onDone; error → red toast, the sheet stays open with its values. */
  async function run(request: () => Promise<unknown>, successText: string) {
    setBusy(true)
    try {
      await request()
      toast.success(successText)
      onDone()
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  const describedBy = mode === 'create' ? { 'aria-describedby': undefined } : {}

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md" {...describedBy}>
        {mode === 'create' ? (
          <CreateForm api={api} busy={busy} run={run} onCancel={onClose} />
        ) : (
          report && <ReportView report={report} user={user} users={users} api={api} busy={busy} run={run} />
        )}
      </SheetContent>
    </Sheet>
  )
}

type Run = (request: () => Promise<unknown>, successText: string) => Promise<void>

function AmountField({
  id,
  value,
  onChange,
  invalid,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  invalid: boolean
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Amount</Label>
      <Input
        id={id}
        inputMode="decimal"
        placeholder="23.50"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-error` : undefined}
      />
      {invalid && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          Enter a number with at most 2 decimals, e.g. 23.50 or 23,5
        </p>
      )}
    </div>
  )
}

function CreateForm({ api, busy, run, onCancel }: { api: Api; busy: boolean; run: Run; onCancel: () => void }) {
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('')
  const [currencies, setCurrencies] = useState<string[]>([])
  const [attempted, setAttempted] = useState(false)

  useEffect(() => {
    let cancelled = false
    api
      .currencies()
      .then((c) => {
        if (cancelled) return
        setCurrencies(c.currencies)
        setCurrency((current) => current || c.default)
      })
      .catch((e: unknown) => {
        if (!cancelled) showError(e)
      })
    return () => {
      cancelled = true
    }
  }, [api])

  const cents = parseAmountToCents(amount)

  function create() {
    if (cents === null) {
      setAttempted(true)
      return
    }
    void run(() => api.create({ title, amountCents: cents, currency }), 'Report created')
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle className="text-lg font-semibold">New report</SheetTitle>
      </SheetHeader>
      <form
        className="space-y-4 px-4 pb-6"
        onSubmit={(e) => {
          e.preventDefault()
          create()
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="create-title">Title</Label>
          <Input id="create-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <AmountField
          id="create-amount"
          value={amount}
          onChange={setAmount}
          invalid={cents === null && (attempted || amount !== '')}
        />
        <div className="space-y-2">
          <Label htmlFor="create-currency">Currency</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger id="create-currency" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currencies.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={busy || !currency}>
            Create
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </>
  )
}

function ReportView({
  report,
  user,
  users,
  api,
  busy,
  run,
}: {
  report: Report
  user: DemoUser
  users: DemoUser[]
  api: Api
  busy: boolean
  run: Run
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(report.title)
  const [amount, setAmount] = useState(() => centsToInput(report.amountCents))
  const [attempted, setAttempted] = useState(false)
  const [note, setNote] = useState('')

  const ownerName = users.find((u) => u.id === report.ownerId)?.name ?? report.ownerId
  const cents = parseAmountToCents(amount)

  function startEdit() {
    setTitle(report.title)
    setAmount(centsToInput(report.amountCents))
    setAttempted(false)
    setEditing(true)
  }

  function save() {
    if (cents === null) {
      setAttempted(true)
      return
    }
    // §8: only the changed fields. With nothing changed, send both current values so the
    // server answers on the report itself (e.g. 409 REPORT_NOT_EDITABLE) instead of 400 for `{}`.
    const body: { title?: string; amountCents?: number } = {}
    if (title !== report.title) body.title = title
    if (cents !== report.amountCents) body.amountCents = cents
    if (body.title === undefined && body.amountCents === undefined) {
      body.title = title
      body.amountCents = cents
    }
    void run(() => api.patch(report.id, body), 'Report saved')
  }

  const buttons = ROLE_BUTTONS[user.role]
  const groups = ROLE_BUTTON_GROUPS[user.role]
  const renderButton = (b: (typeof buttons)[number]) => (
    <Button
      key={b.to}
      {...transitionButtonProps(b.to)}
      disabled={busy}
      onClick={() => void run(() => api.transition(report.id, b.to, note), TRANSITION_TOASTS[b.to])}
    >
      {b.label}
    </Button>
  )

  return (
    <>
      <SheetHeader className="pr-12">
        <SheetTitle className="text-lg font-semibold break-words">{report.title}</SheetTitle>
        <SheetDescription className="text-xs">
          <span className="font-mono break-all">{report.id}</span> · {ownerName}
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-6 px-4 pb-6">
        <section className="space-y-2">
          <StateBadge state={report.state} />
          {editing ? (
            <form
              className="space-y-4 pt-2"
              onSubmit={(e) => {
                e.preventDefault()
                save()
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="edit-title">Title</Label>
                <Input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <AmountField
                id="edit-amount"
                value={amount}
                onChange={setAmount}
                invalid={cents === null && (attempted || amount !== '')}
              />
              <div className="space-y-2">
                <Label htmlFor="edit-currency">Currency</Label>
                <Input id="edit-currency" value={report.currency} disabled />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={busy}>
                  Save
                </Button>
                <Button type="button" variant="outline" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div className="text-2xl font-bold">{formatAmount(report.amountCents, report.currency)}</div>
          )}
          <div className="text-xs text-muted-foreground">
            Created {parseTimestamp(report.createdAt).toLocaleString()} · Updated{' '}
            {parseTimestamp(report.updatedAt).toLocaleString()}
          </div>
        </section>

        {!editing && user.role === 'employee' && (
          <Button variant="outline" onClick={startEdit}>
            <Pencil />
            Edit
          </Button>
        )}
        {!editing && (
          <section className="space-y-2">
            <Label htmlFor="transition-note">Note (optional)</Label>
            <Textarea
              id="transition-note"
              placeholder="Reason, comment…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            {groups ? (
              <div className="space-y-2 pt-1">
                {groups.map((g) => (
                  <div key={g.label} className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">{g.label}</div>
                    <div className="flex flex-wrap gap-2">
                      {buttons.filter((b) => g.targets.includes(b.to)).map(renderButton)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 pt-1">{buttons.map(renderButton)}</div>
            )}
          </section>
        )}

        <HistoryList reportId={report.id} api={api} users={users} />
      </div>
    </>
  )
}
