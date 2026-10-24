import { memo } from 'react'
import { AbandonedBranchRow } from './AbandonedBranchRow'
import { AgentMessageRow } from './AgentMessageRow'
import { AssistantRow } from './AssistantRow'
import { CompactionRow } from './CompactionRow'
import { CompactSummaryRow } from './CompactSummaryRow'
import { EventChipRow } from './EventChipRow'
import { HiddenContextToggle } from './HiddenContextToggle'
import { InterruptedRow } from './InterruptedRow'
import { MetaRow } from './MetaRow'
import { QueuedUserRow } from './QueuedUserRow'
import type { ChatRow } from './rows'
import { SlashCommandRow } from './SlashCommandRow'
import { TaskNotificationRow } from './TaskNotificationRow'
import { UserPromptRow } from './UserPromptRow'

/** Dispatches a flattened row to its component. */
export const RowRenderer = memo(function RowRenderer({ row }: { row: ChatRow }) {
  switch (row.kind) {
    case 'prompt':
      switch (row.turn.kind) {
        case 'human':
          return <UserPromptRow turn={row.turn} />
        case 'slash-command':
          return <SlashCommandRow turn={row.turn} />
        case 'task-notification':
          return <TaskNotificationRow turn={row.turn} />
        case 'agent-message':
          return <AgentMessageRow turn={row.turn} />
        case 'compact-summary':
          return <CompactSummaryRow turn={row.turn} />
        case 'meta':
          return <MetaRow turn={row.turn} />
      }
      return null
    case 'item':
      switch (row.item.kind) {
        case 'assistant':
          return <AssistantRow item={row.item} first={row.firstAssistant} />
        case 'queued-user':
          return <QueuedUserRow item={row.item} />
        case 'event':
          return <EventChipRow item={row.item} />
        case 'compaction':
          return <CompactionRow item={row.item} />
      }
      return null
    case 'abandoned':
      return <AbandonedBranchRow rowId={row.id} branch={row.branch} count={row.count} />
    case 'hidden-context-toggle':
      return <HiddenContextToggle turn={row.turn} />
    case 'interrupted':
      return <InterruptedRow turn={row.turn} />
  }
})
