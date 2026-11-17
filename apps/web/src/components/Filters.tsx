import { useEffect, useState } from 'react'
import { STATES, type DemoUser, type State } from '@app/shared'
import type { DateRange } from 'react-day-picker'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Filters as FiltersState } from '@/lib/filters'
import { STATE_BADGES } from '@/lib/ui-config'

export const EMPTY_FILTERS: FiltersState = { q: '', states: [] }

const ALL = '__all__'

interface FiltersProps {
  filters: FiltersState
  onChange: (f: FiltersState) => void
  users: DemoUser[]
  showEmployee: boolean
}

function fmt(d: Date) {
  return d.toLocaleDateString()
}

export function Filters({ filters, onChange, users, showEmployee }: FiltersProps) {
  const [q, setQ] = useState(filters.q)

  // Debounce the search box; keep it in sync when filters are cleared from outside.
  useEffect(() => setQ(filters.q), [filters.q])
  useEffect(() => {
    if (q === filters.q) return
    const t = setTimeout(() => onChange({ ...filters, q }), 250)
    return () => clearTimeout(t)
  }, [q, filters, onChange])

  const employees = users.filter((u) => u.role === 'employee')
  const range: DateRange | undefined = filters.from ? { from: filters.from, to: filters.to } : undefined
  const dirty =
    filters.q !== '' || q !== '' || filters.states.length > 0 || !!filters.from || !!filters.to || !!filters.ownerId

  function toggleState(s: State, on: boolean) {
    const states = on ? [...filters.states, s] : filters.states.filter((x) => x !== s)
    onChange({ ...filters, states })
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Input
        className="w-64"
        placeholder="Search by title or ID…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">
            State{filters.states.length > 0 ? ` (${filters.states.length})` : ''}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 space-y-2" align="start">
          {STATES.map((s) => (
            <label key={s} className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={filters.states.includes(s)} onCheckedChange={(v) => toggleState(s, v === true)} />
              {STATE_BADGES[s].label}
            </label>
          ))}
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">
            {filters.from ? `${fmt(filters.from)} – ${filters.to ? fmt(filters.to) : '…'}` : 'Created date'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            selected={range}
            onSelect={(r) => onChange({ ...filters, from: r?.from, to: r?.to })}
          />
        </PopoverContent>
      </Popover>

      {showEmployee && (
        <Select
          value={filters.ownerId ?? ALL}
          onValueChange={(v) => onChange({ ...filters, ownerId: v === ALL ? undefined : v })}
        >
          <SelectTrigger className="w-48" aria-label="Employee">
            <SelectValue placeholder="Employee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All employees</SelectItem>
            {employees.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {dirty && (
        <Button variant="ghost" onClick={() => onChange(EMPTY_FILTERS)}>
          Clear filters
        </Button>
      )}
    </div>
  )
}
