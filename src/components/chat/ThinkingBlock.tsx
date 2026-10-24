import { ChevronRight } from 'lucide-react'
import { memo } from 'react'
import { formatDuration } from '@/components/common/format'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { ThinkingBlock as ThinkingBlockData } from '@/lib/transcript/types'
import { cn } from '@/lib/utils'
import { useActiveOccurrence, useExpanded } from './chatStore'
import { Markdown } from './Markdown'

function label(block: ThinkingBlockData): string {
  if (block.redacted) return 'Thinking redacted'
  return block.durationMs !== undefined ? `Thought for ${formatDuration(block.durationMs)}` : 'Thought'
}

/** "Thought for 4.2s": expandable only when the transcript kept the thinking text. */
export const ThinkingBlock = memo(function ThinkingBlock({ block }: { block: ThinkingBlockData }) {
  const hasText = block.text.trim().length > 0
  const [open, toggle] = useExpanded(block.id, false)
  const active = useActiveOccurrence(block.id, block.id, 'thinking')
  const rowClass =
    'inline-flex h-7 items-center gap-1.5 rounded-md -ml-1.5 px-1.5 text-[13.5px] text-fg-muted'
  if (!hasText) {
    return (
      <div data-testid="thinking" data-empty="">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={cn(rowClass, 'cursor-default')} tabIndex={0}>
              {label(block)}
            </span>
          </TooltipTrigger>
          <TooltipContent side="right">
            {block.redacted
              ? 'The thinking was redacted by the API'
              : 'Thinking text was not stored in this transcript'}
          </TooltipContent>
        </Tooltip>
      </div>
    )
  }
  return (
    <div data-testid="thinking">
      <button
        type="button"
        aria-expanded={open}
        onClick={toggle}
        className={cn(
          rowClass,
          'outline-none hover:bg-hover hover:text-fg-secondary focus-visible:ring-2 focus-visible:ring-ring/50',
        )}
      >
        {label(block)}
        <ChevronRight className={cn('size-3.5 transition-transform duration-150', open && 'rotate-90')} />
      </button>
      {open && (
        <div className="mt-1.5 mb-1 border-l-2 border-border pl-4">
          <Markdown markdown={block.text} variant="quiet" activeIndex={active} />
        </div>
      )}
    </div>
  )
})
