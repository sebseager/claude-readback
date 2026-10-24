import { Bot } from 'lucide-react'
import { memo } from 'react'
import type { Turn } from '@/lib/transcript/types'
import { useActiveOccurrence } from './chatStore'
import { Markdown } from './Markdown'
import { SystemCard } from './SystemCard'
import { firstLine, promptText } from './util'

/** A message from another agent (teammate / SendMessage) delivered as a user turn. */
export const AgentMessageRow = memo(function AgentMessageRow({ turn }: { turn: Turn }) {
  const active = useActiveOccurrence(turn.id, undefined, 'prompt')
  const msg = turn.prompt?.agentMessage
  const text = msg?.body ?? (promptText(turn) || turn.prompt?.rawText || '')
  return (
    <SystemCard
      id={turn.id}
      icon={Bot}
      title={msg?.from ? `Message from ${msg.from}` : 'Agent message'}
      preview={firstLine(text)}
      rawUuid={turn.prompt?.recordUuid}
      rawLines={turn.recordLines}
      testId="agent-message"
    >
      {text ? <Markdown markdown={text} className="text-[14px]" activeIndex={active} /> : null}
    </SystemCard>
  )
})
