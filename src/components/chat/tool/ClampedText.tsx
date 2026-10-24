import { memo, useMemo } from 'react'
import { countLines } from '@/components/common/format'
import { highlightText } from '@/components/common/highlight'
import { cn } from '@/lib/utils'
import { useSearchQuery } from '../chatStore'
import { headLines } from './lines'
import { LineClamp } from './LineClamp'

export type Tone = 'default' | 'muted' | 'danger'

const TONES: Record<Tone, string> = {
  default: 'bg-bubble/70 text-fg',
  muted: 'bg-bubble/50 text-fg-secondary',
  danger: 'bg-danger/8 text-danger',
}

type Props = {
  id: string
  text: string
  title?: string
  tone?: Tone
  activeIndex?: number
  className?: string
}

/** Mono text block, clamped at 40 lines, with search highlighting. */
export const ClampedText = memo(function ClampedText({
  id,
  text,
  title,
  tone = 'default',
  activeIndex,
  className,
}: Props) {
  const query = useSearchQuery()
  const lineCount = useMemo(() => countLines(text), [text])
  return (
    <LineClamp id={id} lineCount={lineCount} text={text} title={title} forceAll={activeIndex !== undefined}>
      {(max) => (
        <pre
          className={cn(
            'scrollbar-thin overflow-x-auto rounded-lg px-3 py-2 font-mono text-[12.5px] leading-[1.6] whitespace-pre-wrap wrap-anywhere',
            TONES[tone],
            className,
          )}
        >
          {highlightText(lineCount > max ? headLines(text, max) : text, query, activeIndex)}
        </pre>
      )}
    </LineClamp>
  )
})
