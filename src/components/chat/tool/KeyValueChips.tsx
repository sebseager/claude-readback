import { memo } from 'react'
import { highlightText } from '@/components/common/highlight'
import { useSearchQuery } from '../chatStore'

export type KV = [key: string, value: unknown]

type Props = {
  entries: KV[]
  /** Search occurrence to ring inside the value shown under `key`. */
  activeFor?: (key: string) => number | undefined
}

/** Option chips like `-i true` · `glob *.ts` for Grep/Glob/Agent inputs. Skips empty values. */
export const KeyValueChips = memo(function KeyValueChips({ entries, activeFor }: Props) {
  const query = useSearchQuery()
  const shown = entries.filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== false)
  if (shown.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map(([k, v]) => (
        <span
          key={k}
          className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-main px-2 py-0.5 text-[11.5px]"
        >
          <span className="text-fg-muted">{k}</span>
          <span className="truncate font-mono text-fg-secondary">
            {typeof v === 'string' ? highlightText(v, query, activeFor?.(k)) : JSON.stringify(v)}
          </span>
        </span>
      ))}
    </div>
  )
})
