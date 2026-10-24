import { CheckCircle2, Clock, ShieldX, XCircle } from 'lucide-react'
import type { ToolStatus } from './toolMeta'

/** Status glyph for a tool card header. */
export function ToolStatusBadge({ status }: { status: ToolStatus }) {
  switch (status) {
    case 'success':
      return <CheckCircle2 className="size-3.5 text-success" aria-label="Succeeded" />
    case 'error':
      return <XCircle className="size-3.5 text-danger" aria-label="Failed" />
    case 'denied':
      return (
        <span className="inline-flex items-center gap-1 text-danger">
          <ShieldX className="size-3.5" />
          denied
        </span>
      )
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1 text-fg-muted">
          <Clock className="size-3.5" />
          pending
        </span>
      )
  }
}
