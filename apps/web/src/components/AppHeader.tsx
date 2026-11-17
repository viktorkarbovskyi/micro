import type { DemoUser, Role } from '@app/shared'
import { Button } from '@/components/ui/button'
import { ROLE_COLORS } from '@/lib/ui-config'

type RoleColor = (typeof ROLE_COLORS)[Role]

// Full literal class names so Tailwind can see them.
const HEADER_CLASSES: Record<RoleColor, { bar: string; text: string }> = {
  gray: { bar: 'bg-gray-400/10 border-gray-400', text: 'text-gray-400' },
  green: { bar: 'bg-green-500/10 border-green-500', text: 'text-green-500' },
  gold: { bar: 'bg-amber-400/10 border-amber-400', text: 'text-amber-400' },
  purple: { bar: 'bg-purple-500/10 border-purple-500', text: 'text-purple-500' },
}

interface AppHeaderProps {
  user: DemoUser
  onNewReport: () => void
  onReset: () => void
  onSwitchUser: () => void
}

export function AppHeader({ user, onNewReport, onReset, onSwitchUser }: AppHeaderProps) {
  const c = HEADER_CLASSES[ROLE_COLORS[user.role]]
  return (
    <header className={`flex items-center gap-4 border-b px-6 py-3 ${c.bar}`}>
      <span className="text-lg font-semibold">Expense Reports</span>
      {user.role === 'employee' && <Button onClick={onNewReport}>+ New report</Button>}
      <div className="ml-auto flex items-center gap-3">
        <span className="font-medium text-white">{user.name}</span>
        <span className={c.text}>{user.role}</span>
        {user.role === 'admin' && (
          <Button variant="destructive" onClick={onReset}>
            Reset data
          </Button>
        )}
        <Button variant="outline" onClick={onSwitchUser}>
          Switch user
        </Button>
      </div>
    </header>
  )
}
