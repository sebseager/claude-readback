import { CircleDot, Square, SquareCheck } from 'lucide-react'
import { memo } from 'react'
import { sequentialHighlighter } from '@/components/common/highlight'
import { cn } from '@/lib/utils'
import { useSearchQuery } from '../chatStore'

export interface Todo {
  content: string
  status: string
  activeForm?: string
}

/** TodoWrite checklist. */
export const TodoList = memo(function TodoList({
  todos,
  activeIndex,
}: {
  todos: Todo[]
  activeIndex?: number
}) {
  const query = useSearchQuery()
  const hl = sequentialHighlighter(query, activeIndex)
  if (todos.length === 0) return <p className="text-[12.5px] text-fg-muted italic">Empty list</p>
  return (
    <ul className="flex flex-col gap-1 wrap-anywhere">
      {todos.map((t, i) => {
        const done = t.status === 'completed'
        const doing = t.status === 'in_progress'
        const Icon = done ? SquareCheck : doing ? CircleDot : Square
        return (
          <li key={i} className="flex items-start gap-2 text-[13px]" data-status={t.status}>
            <Icon
              className={cn(
                'mt-0.5 size-3.5 shrink-0',
                done ? 'text-success' : doing ? 'text-accent' : 'text-fg-muted',
              )}
            />
            <span
              className={cn(
                done ? 'text-fg-muted line-through decoration-fg-muted/50' : 'text-fg',
                doing && 'font-medium',
              )}
            >
              {hl(doing && t.activeForm ? t.activeForm : t.content)}
            </span>
          </li>
        )
      })}
    </ul>
  )
})
