import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** "Input" / "Result" section inside a tool card. */
export function Section({
  title,
  aside,
  children,
  className,
}: {
  title: string
  aside?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[11px] font-medium tracking-[0.06em] text-fg-muted uppercase">{title}</h4>
        {aside}
      </div>
      {children}
    </section>
  )
}
