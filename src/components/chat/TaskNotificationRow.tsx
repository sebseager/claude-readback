import { Bell } from 'lucide-react'
import { memo } from 'react'
import { highlightText, splitActive } from '@/components/common/highlight'
import { notificationParts } from '@/lib/transcript/searchText'
import type { Turn } from '@/lib/transcript/types'
import { useActiveOccurrence, useSearchQuery } from './chatStore'
import { Markdown } from './Markdown'
import { SystemCard } from './SystemCard'
import { firstLine } from './util'

/** A background task finished and Claude Code told the model (`<task-notification>`). */
export const TaskNotificationRow = memo(function TaskNotificationRow({ turn }: { turn: Turn }) {
  const query = useSearchQuery()
  const active = useActiveOccurrence(turn.id, undefined, 'prompt')
  const { summary, status, result } = turn.prompt
    ? notificationParts(turn.prompt)
    : { summary: undefined, status: undefined, result: '' }
  // Same order as the search index: summary, status, result.
  const [summaryActive, statusActive, resultActive] = splitActive([summary, status, result], query, active)
  const preview = summary ? (
    <>
      {highlightText(summary, query, summaryActive)}
      {status && <> · {highlightText(status, query, statusActive)}</>}
    </>
  ) : (
    highlightText(firstLine(result), query)
  )
  return (
    <SystemCard
      id={turn.id}
      icon={Bell}
      title="Task notification"
      preview={preview}
      rawUuid={turn.prompt?.recordUuid}
      rawLines={turn.recordLines}
      testId="task-notification"
    >
      {result ? <Markdown markdown={result} className="text-[14px]" activeIndex={resultActive} /> : null}
    </SystemCard>
  )
})
