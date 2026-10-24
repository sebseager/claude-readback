import { ChevronRight, SquareTerminal } from 'lucide-react'
import { memo } from 'react'
import { highlightText, splitActive } from '@/components/common/highlight'
import { slashCommandParts } from '@/lib/transcript/searchText'
import type { Turn } from '@/lib/transcript/types'
import { cn } from '@/lib/utils'
import { AttachmentChips } from './AttachmentChips'
import { useActiveOccurrence, useExpanded, useSearchQuery } from './chatStore'
import { RawJsonButton } from './RawJsonButton'

/** Centered `/name args` chip, with the command's stdout expandable below. */
export const SlashCommandRow = memo(function SlashCommandRow({ turn }: { turn: Turn }) {
  const cmd = turn.prompt?.command
  const query = useSearchQuery()
  const active = useActiveOccurrence(turn.id, undefined, 'prompt')
  const { label, output } = slashCommandParts(cmd ?? { name: '' })
  const [labelActive, outputActive] = splitActive([label, output], query, active)
  const [open, toggle] = useExpanded(turn.id, false)
  return (
    <div className="group/row flex flex-col items-center gap-2" data-testid="slash-command">
      {turn.prompt && turn.prompt.segments.length > 0 && (
        <AttachmentChips
          segments={turn.prompt.segments}
          mentions={[]}
          rowId={turn.id}
          className="items-center"
        />
      )}
      {/* pl-7 balances the raw-JSON button so the pill sits on the same center line as event chips. */}
      <div className="flex max-w-full items-center gap-1 pl-7">
        <button
          type="button"
          disabled={!output}
          aria-expanded={output ? open : undefined}
          onClick={toggle}
          className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-sidebar/60 px-3 font-mono text-[12.5px] text-fg-secondary outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring/50 disabled:hover:bg-sidebar/60"
        >
          <SquareTerminal className="size-3.5 text-fg-muted" />
          <span className="max-w-[28rem] truncate">{highlightText(label, query, labelActive)}</span>
          {output && (
            <ChevronRight
              className={cn('size-3.5 text-fg-muted transition-transform duration-150', open && 'rotate-90')}
            />
          )}
        </button>
        <RawJsonButton lines={turn.recordLines} uuid={turn.prompt?.recordUuid} />
      </div>
      {output && open && (
        <pre className="scrollbar-thin max-h-80 w-full overflow-auto rounded-xl border border-border bg-bubble/60 px-3 py-2 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap wrap-anywhere text-fg-secondary">
          {highlightText(output, query, outputActive)}
        </pre>
      )}
    </div>
  )
})
