import { MARK_ACTIVE_CLASS, MARK_CLASS } from '@/components/common/highlight'
import { cn } from '@/lib/utils'
import type { ChipSearch } from './chipSearch'

/** Match count inside a chip's (dialog) text, ringed when the active hit is in there. */
export function ChipHitCount({ hits, active }: ChipSearch) {
  if (hits === 0) return null
  return (
    <mark
      className={cn(
        MARK_CLASS,
        'rounded-full px-1.5 text-[11px] tabular-nums',
        active !== undefined && MARK_ACTIVE_CLASS,
      )}
      data-search-active={active !== undefined ? '' : undefined}
      title={`${hits} search match${hits === 1 ? '' : 'es'} inside`}
    >
      {hits}
    </mark>
  )
}
