import { useMemo } from 'react'
import type { DemoUser, Report } from '@app/shared'
import { flexRender } from '@tanstack/react-table'
import { getCoreRowModel, useLegacyTable, type LegacyColumnDef } from '@tanstack/react-table/legacy'
import { StateBadge } from '@/components/StateBadge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatAmount } from '@/lib/money'
import { parseTimestamp } from '@/lib/time'

interface ReportsTableProps {
  reports: Report[]
  /** Whether a list load has finished; until then the empty text is not shown. */
  loaded: boolean
  users: DemoUser[]
  showEmployee: boolean
  onOpen: (id: string) => void
}

export function ReportsTable({ reports, loaded, users, showEmployee, onOpen }: ReportsTableProps) {
  const columns = useMemo<LegacyColumnDef<Report>[]>(() => {
    const names = new Map(users.map((u) => [u.id, u.name]))
    const cols: LegacyColumnDef<Report>[] = [
      {
        id: 'id',
        header: 'ID',
        cell: ({ row }) => <span className="font-mono text-muted-foreground">{row.original.id.slice(0, 8)}</span>,
      },
      { id: 'title', header: 'Title', cell: ({ row }) => row.original.title },
    ]
    if (showEmployee) {
      cols.push({
        id: 'employee',
        header: 'Employee',
        cell: ({ row }) => names.get(row.original.ownerId) ?? row.original.ownerId,
      })
    }
    cols.push(
      {
        id: 'amount',
        header: 'Amount',
        cell: ({ row }) => formatAmount(row.original.amountCents, row.original.currency),
      },
      { id: 'state', header: 'State', cell: ({ row }) => <StateBadge state={row.original.state} /> },
      { id: 'created', header: 'Created', cell: ({ row }) => parseTimestamp(row.original.createdAt).toLocaleString() },
      { id: 'updated', header: 'Updated', cell: ({ row }) => parseTimestamp(row.original.updatedAt).toLocaleString() },
    )
    return cols
  }, [users, showEmployee])

  const table = useLegacyTable({ data: reports, columns, getCoreRowModel: getCoreRowModel() })

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((h) => (
                <TableHead key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                {loaded ? 'No reports yet' : ''}
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} className="cursor-pointer" onClick={() => onOpen(row.original.id)}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
