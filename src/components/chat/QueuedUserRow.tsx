import { memo } from 'react'
import { formatDateTime, formatTime } from '@/components/common/format'
import type { QueuedUserItem } from '@/lib/transcript/types'
import { AttachmentChips } from './AttachmentChips'
import { useActiveOccurrence } from './chatStore'
import { QueuedBadge } from './QueuedBadge'
import { RawJsonButton } from './RawJsonButton'
import { UserBubble } from './UserBubble'
import { hasPromptBody } from './util'

/** A message typed while Claude was busy and delivered mid-turn. */
export const QueuedUserRow = memo(function QueuedUserRow({ item }: { item: QueuedUserItem }) {
  const active = useActiveOccurrence(item.id, undefined, 'prompt')
  // Pasted blocks are inline chips in the bubble; other attachments are chips above it.
  const show = item.segments ? hasPromptBody(item.segments) : item.text.length > 0
  return (
    <div className="group/row relative flex flex-col items-end gap-1.5" data-testid="queued-user">
      <QueuedBadge />
      {item.segments && (
        <AttachmentChips segments={item.segments} mentions={[]} rowId={item.id} omit={['pasted']} />
      )}
      {show && (
        <UserBubble
          text={item.text}
          segments={item.segments}
          rowId={item.id}
          activeIndex={active}
          className="border border-dashed border-border"
        />
      )}
      <div className="absolute -bottom-5 right-1 flex h-5 items-center gap-1 text-[11px] text-fg-muted">
        <RawJsonButton lines={[item.recordLine]} title="Raw queued message" />
        <time
          dateTime={item.at}
          title={formatDateTime(item.at)}
          className="opacity-0 transition-opacity duration-150 group-hover/row:opacity-100"
        >
          {formatTime(item.at)}
        </time>
      </div>
    </div>
  )
})
