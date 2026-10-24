import { ChevronRight } from 'lucide-react'
import { memo } from 'react'
import { formatDateTime } from '@/components/common/format'
import { highlightText, splitActive } from '@/components/common/highlight'
import type { EventItem, EventLevel } from '@/lib/transcript/types'
import { cn } from '@/lib/utils'
import { useActiveOccurrence, useExpanded, useSearchQuery } from './chatStore'
import { EVENT_ICONS } from './eventIcons'
import { RawJsonButton } from './RawJsonButton'

const LEVEL_CLASS: Record<EventLevel, string> = {
  info: 'text-fg-muted',
  notice: 'text-fg-secondary',
  warning: 'border-accent/30 text-fg-secondary [&>svg]:text-accent',
  error: 'border-danger/35 bg-danger/8 text-danger',
}

/** Centered, muted pill for system events (turn duration, hooks, interrupts, errors…). */
export const EventChipRow = memo(function EventChipRow({ item }: { item: EventItem }) {
  const Icon = EVENT_ICONS[item.category] ?? EVENT_ICONS.other
  const query = useSearchQuery()
  const active = useActiveOccurrence(item.id, undefined, 'event')
  const [labelActive, detailActive] = splitActive([item.label, item.detail], query, active)
  const [open, toggle] = useExpanded(item.id, false)
  const hasDetail = Boolean(item.detail)
  return (
    <div
      className="group/row flex flex-col items-center gap-2"
      data-testid="event-chip"
      data-category={item.category}
    >
      <div className="flex max-w-full items-center gap-1 pl-7">
        <button
          type="button"
          disabled={!hasDetail}
          aria-expanded={hasDetail ? open : undefined}
          onClick={toggle}
          title={formatDateTime(item.at) || undefined}
          className={cn(
            'inline-flex h-6 min-w-0 items-center gap-1.5 rounded-full border border-transparent px-2.5 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
            hasDetail && 'hover:bg-hover',
            LEVEL_CLASS[item.level],
          )}
        >
          <Icon className="size-3.5 shrink-0" />
          <span className="truncate">{highlightText(item.label, query, labelActive)}</span>
          {hasDetail && (
            <ChevronRight
              className={cn('size-3 shrink-0 transition-transform duration-150', open && 'rotate-90')}
            />
          )}
        </button>
        <RawJsonButton lines={item.recordLines} />
      </div>
      {hasDetail && open && (
        <pre className="scrollbar-thin max-h-80 w-full overflow-auto rounded-xl border border-border bg-bubble/50 px-3 py-2 font-mono text-[12px] leading-relaxed whitespace-pre-wrap wrap-anywhere text-fg-secondary">
          {highlightText(item.detail ?? '', query, detailActive)}
        </pre>
      )}
    </div>
  )
})
