import { memo } from 'react'
import { formatDateTime, formatTime } from '@/components/common/format'
import type { Turn } from '@/lib/transcript/types'
import { AttachmentChips } from './AttachmentChips'
import { QueuedBadge } from './QueuedBadge'
import { useActiveOccurrence } from './chatStore'
import { RawJsonButton } from './RawJsonButton'
import { UserBubble } from './UserBubble'
import { hasPromptBody } from './util'

/** A human prompt: attachment chips above a right-aligned bubble; timestamp + raw action on hover. */
export const UserPromptRow = memo(function UserPromptRow({ turn }: { turn: Turn }) {
  const prompt = turn.prompt
  const active = useActiveOccurrence(turn.id, undefined, 'prompt')
  if (!prompt) return null
  return (
    <div className="group/row relative flex flex-col items-end gap-1.5" data-testid="user-prompt">
      {prompt.queued && <QueuedBadge />}
      <AttachmentChips
        segments={prompt.segments}
        mentions={prompt.mentions}
        rowId={turn.id}
        omit={['pasted']}
      />
      {hasPromptBody(prompt.segments) && (
        <UserBubble segments={prompt.segments} rowId={turn.id} activeIndex={active} />
      )}
      <div className="absolute -bottom-5 right-1 flex h-5 items-center gap-1 text-[11px] text-fg-muted">
        <RawJsonButton lines={turn.recordLines} uuid={prompt.recordUuid} title="Raw prompt record" />
        <time
          dateTime={turn.startedAt}
          title={formatDateTime(turn.startedAt)}
          className="opacity-0 transition-opacity duration-150 group-hover/row:opacity-100"
        >
          {formatTime(turn.startedAt)}
        </time>
      </div>
    </div>
  )
})
