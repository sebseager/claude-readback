import { Layers } from 'lucide-react'
import { memo } from 'react'
import type { Turn } from '@/lib/transcript/types'
import { useActiveOccurrence } from './chatStore'
import { Markdown } from './Markdown'
import { SystemCard } from './SystemCard'
import { promptText } from './util'

/** The summary Claude Code wrote after compaction, fed back as the first user message. */
export const CompactSummaryRow = memo(function CompactSummaryRow({ turn }: { turn: Turn }) {
  const active = useActiveOccurrence(turn.id, undefined, 'prompt')
  const text = promptText(turn) || turn.prompt?.rawText || ''
  return (
    <SystemCard
      id={turn.id}
      icon={Layers}
      title="Summary of the earlier conversation"
      preview={text ? `${text.length.toLocaleString()} characters` : undefined}
      rawUuid={turn.prompt?.recordUuid}
      rawLines={turn.recordLines}
      testId="compact-summary"
    >
      {text ? <Markdown markdown={text} className="text-[14px]" activeIndex={active} /> : null}
    </SystemCard>
  )
})
