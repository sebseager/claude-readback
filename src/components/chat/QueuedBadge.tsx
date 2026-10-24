import { Clock } from 'lucide-react'

/** "Queued while Claude was working" marker above a user bubble. */
export function QueuedBadge() {
  return (
    <span className="inline-flex items-center gap-1 pr-1 text-[11.5px] text-fg-muted">
      <Clock className="size-3" />
      Queued while Claude was working
    </span>
  )
}
