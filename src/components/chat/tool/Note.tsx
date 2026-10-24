import { Info, ShieldX, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

const TONES = {
  info: { icon: Info, cls: 'border-border bg-bubble/50 text-fg-secondary' },
  danger: { icon: ShieldX, cls: 'border-danger/30 bg-danger/8 text-danger' },
  warning: { icon: TriangleAlert, cls: 'border-accent/30 bg-accent/8 text-accent-hover dark:text-accent' },
} as const

/** Inline callout (truncated output, denial, errors). */
export function Note({
  tone = 'info',
  children,
  className,
}: {
  tone?: keyof typeof TONES
  children: ReactNode
  className?: string
}) {
  const { icon: Icon, cls } = TONES[tone]
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-lg border px-3 py-2 text-[12.5px] leading-snug',
        cls,
        className,
      )}
    >
      <Icon className="mt-px size-3.5 shrink-0" />
      <div className="min-w-0 wrap-anywhere">{children}</div>
    </div>
  )
}
