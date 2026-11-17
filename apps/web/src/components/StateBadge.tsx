import type { State } from '@app/shared'
import { Badge } from '@/components/ui/badge'
import { STATE_BADGES, type StateColor } from '@/lib/ui-config'

// Full literal class names so Tailwind can see them.
const COLOR_CLASSES: Record<StateColor, string> = {
  gray: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
  blue: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  violet: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  amber: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  green: 'bg-green-500/15 text-green-400 border-green-500/30',
  red: 'bg-red-500/15 text-red-400 border-red-500/30',
}

export function StateBadge({ state }: { state: State }) {
  const b = STATE_BADGES[state]
  return (
    <Badge variant="outline" className={COLOR_CLASSES[b.color]}>
      {b.label}
    </Badge>
  )
}
