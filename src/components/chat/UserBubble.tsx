import type { ReactNode } from 'react'
import { highlightText } from '@/components/common/highlight'
import { cn } from '@/lib/utils'
import { useSearchQuery } from './chatStore'

type Props = { text: string; activeIndex?: number; className?: string; children?: ReactNode }

/** Right-aligned user bubble: plain text, whitespace preserved, no markdown or links. */
export function UserBubble({ text, activeIndex, className, children }: Props) {
  const query = useSearchQuery()
  return (
    <div
      className={cn(
        'max-w-[80%] rounded-2xl bg-bubble px-4 py-3 whitespace-pre-wrap wrap-anywhere text-fg',
        className,
      )}
    >
      {children}
      {highlightText(text, query, activeIndex)}
    </div>
  )
}
