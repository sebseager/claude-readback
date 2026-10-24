import { Ban } from 'lucide-react'
import { memo } from 'react'
import type { Turn } from '@/lib/transcript/types'

const LABELS: Record<NonNullable<Turn['interrupted']>, string> = {
  user: 'Interrupted by user',
  'tool-use': 'Interrupted during tool use',
  shutdown: 'Session ended before the turn finished',
}

/** End-of-turn marker for interrupted turns that carry no explicit interrupt event. */
export const InterruptedRow = memo(function InterruptedRow({ turn }: { turn: Turn }) {
  if (!turn.interrupted) return null
  return (
    <div className="flex justify-center" data-testid="interrupted">
      <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-accent/35 bg-accent/8 px-2.5 text-[12px] text-accent-hover dark:text-accent">
        <Ban className="size-3.5" />
        {LABELS[turn.interrupted]}
      </span>
    </div>
  )
})
