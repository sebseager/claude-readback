import { ChevronRight, Eye } from 'lucide-react'
import { memo } from 'react'
import type { HiddenContextItem, Turn } from '@/lib/transcript/types'
import { cn } from '@/lib/utils'
import { highlightText, splitActive } from '@/components/common/highlight'
import { useActiveIn, useChatStore, useHiddenContextShown, useSearchQuery } from './chatStore'
import { ClampedText } from './tool/ClampedText'
import { RawJsonButton } from './RawJsonButton'

/** Tiny "N context items" toggle at the end of a turn; reveals what the model saw but the user didn't. */
export const HiddenContextToggle = memo(function HiddenContextToggle({ turn }: { turn: Turn }) {
  const shown = useHiddenContextShown(turn.id)
  const setShown = useChatStore((s) => s.setHiddenContextShown)
  const n = turn.hiddenContext.length
  return (
    <div className="flex flex-col gap-2" data-testid="hidden-context">
      {/* Centered like the event chips around it (same column). */}
      <div className="flex justify-center">
        <button
          type="button"
          aria-expanded={shown}
          onClick={() => setShown(turn.id, !shown)}
          className="inline-flex h-6 items-center gap-1.5 rounded-full px-2 text-[11.5px] text-fg-muted outline-none hover:bg-hover hover:text-fg-secondary focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Eye className="size-3.5" />
          {n} context item{n === 1 ? '' : 's'}
          <ChevronRight className={cn('size-3 transition-transform duration-150', shown && 'rotate-90')} />
        </button>
      </div>
      {shown && (
        <div className="ml-9 flex flex-col gap-2">
          {turn.hiddenContext.map((h) => (
            <HiddenContextBlock key={h.id} turnId={turn.id} item={h} />
          ))}
        </div>
      )}
    </div>
  )
})

function HiddenContextBlock({ turnId, item }: { turnId: string; item: HiddenContextItem }) {
  const query = useSearchQuery()
  // Indexed as "label\ntext" under the turn id and `ctx:<item id>`.
  const active = useActiveIn(turnId, `ctx:${item.id}`, 'context')
  const [labelActive, textActive] = splitActive([item.label, item.text], query, active)
  return (
    <div className="group/row rounded-xl border border-dashed border-border px-3 py-2">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="font-mono text-[11px] tracking-wide text-fg-muted">
          {highlightText(item.label, query, labelActive)}
        </span>
        <RawJsonButton lines={[item.recordLine]} />
      </div>
      <ClampedText id={item.id} text={item.text} title={item.label} tone="muted" activeIndex={textActive} />
    </div>
  )
}
