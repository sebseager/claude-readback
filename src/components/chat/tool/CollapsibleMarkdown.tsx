import { ChevronRight } from 'lucide-react'
import { memo } from 'react'
import { countMatches, MARK_CLASS } from '@/components/common/highlight'
import { cn } from '@/lib/utils'
import { useExpanded, useRevealWhenActive, useSearchQuery } from '../chatStore'
import { Markdown } from '../Markdown'

/** A labeled, collapsed-by-default markdown block (Agent prompt). */
export const CollapsibleMarkdown = memo(function CollapsibleMarkdown({
  id,
  label,
  markdown,
  activeIndex,
}: {
  id: string
  label: string
  markdown: string
  /** Search occurrence to ring inside the markdown; opens the block. */
  activeIndex?: number
}) {
  const [open, toggle] = useExpanded(id, false)
  useRevealWhenActive(id, activeIndex)
  const query = useSearchQuery()
  const hits = !open && query.trim() ? countMatches(markdown, query) : 0
  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        aria-expanded={open}
        onClick={toggle}
        className="flex w-full items-center gap-1.5 rounded-lg px-3 py-1.5 text-left text-[12.5px] text-fg-secondary outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <ChevronRight className={cn('size-3.5 transition-transform duration-150', open && 'rotate-90')} />
        {label}
        <span className="text-fg-muted">· {markdown.length.toLocaleString()} chars</span>
        {hits > 0 && (
          <mark className={`${MARK_CLASS} px-1 text-[11.5px]`}>
            {hits} match{hits === 1 ? '' : 'es'}
          </mark>
        )}
      </button>
      {open && (
        <div className="border-t border-border px-3 py-2">
          <Markdown markdown={markdown} className="text-[13.5px]" activeIndex={activeIndex} />
        </div>
      )}
    </div>
  )
})
