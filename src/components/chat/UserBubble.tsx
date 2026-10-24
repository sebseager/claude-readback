import type { ReactNode } from 'react'
import { highlightText, splitActive } from '@/components/common/highlight'
import type { PromptSegment } from '@/lib/transcript/types'
import { cn } from '@/lib/utils'
import { useSearchQuery } from './chatStore'
import { PastedTextChip } from './PastedTextChip'
import { promptBody } from './util'

type Props = {
  /** Plain text body. */
  text?: string
  /** Prompt segments: prose with pasted blocks as inline chips where they were pasted. Wins over `text`. */
  segments?: readonly PromptSegment[]
  /** Row the bubble renders in; scopes search hits inside inline chips. */
  rowId?: string
  activeIndex?: number
  className?: string
  children?: ReactNode
}

/** Right-aligned user bubble: plain text, whitespace preserved, no markdown or links. */
export function UserBubble({ text, segments, rowId, activeIndex, className, children }: Props) {
  const query = useSearchQuery()
  let body: ReactNode
  if (segments) {
    const parts = promptBody(segments)
    const actives = splitActive(
      parts.map((p) => (p.kind === 'text' ? p.text : undefined)),
      query,
      activeIndex,
    )
    body = parts.map((p, i) =>
      p.kind === 'text' ? (
        <span key={i}>{highlightText(p.text, query, actives[i])}</span>
      ) : (
        <PastedTextChip
          key={p.id}
          rowId={rowId}
          index={p.index}
          lines={p.lines}
          text={p.text}
          className="mx-0.5 align-middle"
        />
      ),
    )
  } else {
    body = highlightText(text ?? '', query, activeIndex)
  }
  return (
    <div
      className={cn(
        'max-w-[80%] rounded-2xl bg-bubble px-4 py-3 whitespace-pre-wrap wrap-anywhere text-fg',
        className,
      )}
    >
      {children}
      {body}
    </div>
  )
}
