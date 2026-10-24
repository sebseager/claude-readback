import { ChevronRight, Layers } from 'lucide-react'
import { memo } from 'react'
import { formatTokens } from '@/components/common/format'
import type { CompactionItem } from '@/lib/transcript/types'
import { cn } from '@/lib/utils'
import { highlightText, splitActive } from '@/components/common/highlight'
import { useActiveOccurrence, useExpanded, useSearchQuery } from './chatStore'
import { Markdown } from './Markdown'
import { RawJsonButton } from './RawJsonButton'

const LABEL = 'Context compacted'

/** Full-width divider where the context was compacted; the summary expands below. */
export const CompactionRow = memo(function CompactionRow({ item }: { item: CompactionItem }) {
  const [open, toggle] = useExpanded(item.id, false)
  const hasSummary = Boolean(item.summaryMarkdown)
  const query = useSearchQuery()
  // Indexed as "Context compacted\n<summary>".
  const [labelActive, summaryActive] = splitActive(
    [LABEL, item.summaryMarkdown],
    query,
    useActiveOccurrence(item.id, undefined, 'event'),
  )
  const parts: string[] = []
  if (item.preTokens) parts.push(`${formatTokens(item.preTokens)} tokens before`)
  if (item.trigger) parts.push(item.trigger)
  return (
    <div className="group/row" data-testid="compaction">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <button
          type="button"
          disabled={!hasSummary}
          aria-expanded={hasSummary ? open : undefined}
          onClick={toggle}
          className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-main px-3 text-[12px] text-fg-secondary outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring/50 disabled:hover:bg-main"
        >
          <Layers className="size-3.5 text-fg-muted" />
          {highlightText(LABEL, query, labelActive)}
          {parts.map((p) => ` · ${p}`).join('')}
          {hasSummary && (
            <ChevronRight
              className={cn('size-3.5 text-fg-muted transition-transform duration-150', open && 'rotate-90')}
            />
          )}
        </button>
        <div className="h-px flex-1 bg-border" />
        <RawJsonButton lines={item.recordLines} className="-ml-2" />
      </div>
      {hasSummary && open && (
        <div className="mt-3 rounded-xl border border-border px-4 py-3">
          <Markdown
            markdown={item.summaryMarkdown ?? ''}
            className="text-[14px]"
            activeIndex={summaryActive}
          />
        </div>
      )}
    </div>
  )
})
