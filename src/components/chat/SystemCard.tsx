import { ChevronRight, type LucideIcon } from 'lucide-react'
import { memo, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useExpanded } from './chatStore'
import { RawJsonButton } from './RawJsonButton'

type Props = {
  /** Expansion key (row id). */
  id: string
  icon: LucideIcon
  title: ReactNode
  preview?: ReactNode
  defaultOpen?: boolean
  rawUuid?: string
  rawLines?: number[]
  children?: ReactNode
  testId?: string
}

/** Compact system-style card (task notifications, agent messages, compact summaries, meta). */
export const SystemCard = memo(function SystemCard({
  id,
  icon: Icon,
  title,
  preview,
  defaultOpen = false,
  rawUuid,
  rawLines,
  children,
  testId,
}: Props) {
  const [open, toggle] = useExpanded(id, defaultOpen)
  const expandable = children !== undefined && children !== null && children !== false
  return (
    <div className="group/row rounded-xl border border-border" data-testid={testId}>
      <div className="flex items-center gap-1 pr-1.5">
        <button
          type="button"
          aria-expanded={expandable ? open : undefined}
          disabled={!expandable}
          onClick={toggle}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-default"
        >
          <Icon className="size-4 shrink-0 text-fg-muted" />
          <span className="shrink-0 font-medium text-fg-secondary">{title}</span>
          {preview && <span className="min-w-0 truncate text-fg-muted">{preview}</span>}
          {expandable && (
            <ChevronRight
              className={cn(
                'ml-auto size-4 shrink-0 text-fg-muted transition-transform duration-150',
                open && 'rotate-90',
              )}
            />
          )}
        </button>
        <RawJsonButton uuid={rawUuid} lines={rawLines} />
      </div>
      {expandable && open && <div className="border-t border-border px-4 py-3">{children}</div>}
    </div>
  )
})
