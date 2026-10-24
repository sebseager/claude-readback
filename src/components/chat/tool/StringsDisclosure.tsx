import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { MARK_CLASS } from '@/components/common/highlight'
import { cn } from '@/lib/utils'
import { useExpanded, useRevealWhenActive } from '../chatStore'

type Props = {
  /** Expansion key. */
  id: string
  label: ReactNode
  /** Search matches inside (shown as a mark while collapsed). */
  hits: number
  /** Active search occurrence inside: opens the disclosure. */
  activeIndex?: number
  children: ReactNode
}

/** A tiny, collapsed-by-default "old → new strings" toggle (Edit input when the result has the patch). */
export function StringsDisclosure({ id, label, hits, activeIndex, children }: Props) {
  const [open, toggle] = useExpanded(id, false)
  useRevealWhenActive(id, activeIndex)
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={toggle}
        className="inline-flex items-center gap-1 self-start rounded-md px-1 py-0.5 text-[12px] text-fg-muted outline-none hover:bg-hover hover:text-fg-secondary focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <ChevronRight className={cn('size-3.5 transition-transform duration-150', open && 'rotate-90')} />
        {label}
        {!open && hits > 0 && (
          <mark className={cn(MARK_CLASS, 'ml-1 px-1 text-[11px] tabular-nums')}>
            {hits} match{hits === 1 ? '' : 'es'}
          </mark>
        )}
      </button>
      {open && children}
    </div>
  )
}
