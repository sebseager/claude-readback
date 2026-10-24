import { Check } from 'lucide-react'
import { memo } from 'react'
import { sequentialHighlighter } from '@/components/common/highlight'
import { cn } from '@/lib/utils'
import { useSearchQuery } from '../chatStore'

export interface Question {
  question: string
  header?: string
  options: Array<{ label: string; description?: string }>
  multiSelect?: boolean
}

type Props = {
  questions: Question[]
  answers?: Record<string, string>
  /** Search occurrence to ring, counted over headers, questions, options and "Other" answers in order. */
  activeIndex?: number
}

function chosen(answer: string | undefined, label: string, multi?: boolean): boolean {
  if (answer === undefined) return false
  if (answer === label) return true
  return Boolean(multi) && answer.split(/,\s*/).includes(label)
}

/** AskUserQuestion: questions and options; chosen answers highlighted in accent. */
export const QuestionsView = memo(function QuestionsView({ questions, answers, activeIndex }: Props) {
  const query = useSearchQuery()
  // Called in render order: header, question, then each option's label and description.
  const hl = sequentialHighlighter(query, activeIndex)
  return (
    <div className="flex flex-col gap-3 wrap-anywhere">
      {questions.map((q, qi) => {
        const answer = answers?.[q.question]
        const matched = q.options.some((o) => chosen(answer, o.label, q.multiSelect))
        return (
          <div key={qi} className="flex flex-col gap-1.5">
            <div className="flex items-baseline gap-2">
              {q.header && (
                <span className="rounded-full bg-bubble px-2 py-px text-[11px] text-fg-secondary">
                  {hl(q.header)}
                </span>
              )}
              <p className="text-[13.5px] font-medium text-fg">{hl(q.question)}</p>
            </div>
            <ul className="flex flex-col gap-1">
              {q.options.map((o) => {
                const on = chosen(answer, o.label, q.multiSelect)
                return (
                  <li
                    key={o.label}
                    data-chosen={on || undefined}
                    className={cn(
                      'flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-[13px]',
                      on ? 'border-accent/50 bg-accent/10 text-fg' : 'border-border text-fg-secondary',
                    )}
                  >
                    <Check className={cn('mt-0.5 size-3.5 shrink-0', on ? 'text-accent' : 'invisible')} />
                    <span>
                      <span className={cn(on && 'font-medium')}>{hl(o.label)}</span>
                      {o.description && <span className="text-fg-muted"> — {hl(o.description)}</span>}
                    </span>
                  </li>
                )
              })}
              {answer !== undefined && !matched && (
                <li className="flex items-start gap-2 rounded-lg border border-accent/50 bg-accent/10 px-2.5 py-1.5 text-[13px] text-fg">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-accent" />
                  <span>
                    <span className="text-fg-muted">Other: </span>
                    {hl(answer)}
                  </span>
                </li>
              )}
            </ul>
          </div>
        )
      })}
    </div>
  )
})
