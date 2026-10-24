import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Compact card on the stats panel: 12px uppercase muted title, optional action on the right. */
export function StatCard({
  title,
  action,
  className,
  children,
}: {
  title: string
  action?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section aria-label={title} className={cn('rounded-xl border border-border bg-main p-4', className)}>
      <div className="mb-3 flex min-h-4 items-center justify-between gap-2">
        <h3 className="text-xs font-medium tracking-wide text-fg-muted uppercase">{title}</h3>
        {action}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  )
}
