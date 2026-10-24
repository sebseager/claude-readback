import { Info } from 'lucide-react'
import { memo } from 'react'
import { highlightText } from '@/components/common/highlight'
import type { Turn } from '@/lib/transcript/types'
import { useActiveOccurrence, useSearchQuery } from './chatStore'
import { SystemCard } from './SystemCard'
import { firstLine, promptText } from './util'

/** A meta user record (skill body, caveat, injected instructions…). */
export const MetaRow = memo(function MetaRow({ turn }: { turn: Turn }) {
  const query = useSearchQuery()
  const active = useActiveOccurrence(turn.id, undefined, 'prompt')
  const text = promptText(turn) || turn.prompt?.rawText || ''
  return (
    <SystemCard
      id={turn.id}
      icon={Info}
      title="Meta"
      preview={firstLine(text)}
      rawUuid={turn.prompt?.recordUuid}
      rawLines={turn.recordLines}
      testId="meta"
    >
      {text ? (
        <pre className="scrollbar-thin max-h-96 overflow-auto font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap wrap-anywhere text-fg-secondary">
          {highlightText(text, query, active)}
        </pre>
      ) : null}
    </SystemCard>
  )
})
