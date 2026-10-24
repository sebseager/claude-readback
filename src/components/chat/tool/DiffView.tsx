import { memo, useMemo } from 'react'
import { highlightText, splitActive } from '@/components/common/highlight'
import { cn } from '@/lib/utils'
import { useSearchQuery } from '../chatStore'
import { toRows, type Hunk } from './diff'
import { LineClamp } from './LineClamp'

const ROW_CLASS = {
  hunk: 'bg-bubble text-fg-muted',
  add: 'bg-success/12 text-fg',
  del: 'bg-danger/10 text-fg',
  ctx: 'text-fg-secondary',
} as const

type Props = {
  id: string
  hunks: Hunk[]
  title?: string
  showHunkHeaders?: boolean
  showNumbers?: boolean
  /** Search occurrence to ring, counted over the line texts in order (hunk headers excluded). */
  activeIndex?: number
}

/** Unified diff with green/red line backgrounds and old/new line numbers. */
export const DiffView = memo(function DiffView({
  id,
  hunks,
  title = 'Diff',
  showHunkHeaders = true,
  showNumbers = true,
  activeIndex,
}: Props) {
  const query = useSearchQuery()
  const rows = useMemo(() => {
    const all = toRows(hunks)
    return showHunkHeaders ? all : all.filter((r) => r.kind !== 'hunk')
  }, [hunks, showHunkHeaders])
  const rowActive = useMemo(
    () =>
      activeIndex === undefined
        ? undefined
        : splitActive(
            rows.map((r) => (r.kind === 'hunk' ? '' : r.text)),
            query,
            activeIndex,
          ),
    [rows, query, activeIndex],
  )
  const text = () =>
    rows
      .map((r) =>
        r.kind === 'hunk' ? r.text : `${r.kind === 'add' ? '+' : r.kind === 'del' ? '-' : ' '}${r.text}`,
      )
      .join('\n')
  return (
    <LineClamp id={id} lineCount={rows.length} text={text} title={title} forceAll={activeIndex !== undefined}>
      {(max) => (
        <div className="scrollbar-thin overflow-x-auto rounded-lg border border-border/70 bg-main font-mono text-[12.5px] leading-[1.6]">
          <table className="w-full border-collapse">
            <tbody>
              {rows.slice(0, max).map((r, i) => (
                <tr key={i} className={ROW_CLASS[r.kind]}>
                  {r.kind === 'hunk' ? (
                    <td colSpan={showNumbers ? 4 : 2} className="px-3 py-0.5 text-[11.5px]">
                      {r.text}
                    </td>
                  ) : (
                    <>
                      {showNumbers && (
                        <>
                          <td className="w-[1%] pl-2 text-right text-fg-muted/80 select-none">
                            {r.oldNo ?? ''}
                          </td>
                          <td className="w-[1%] pr-1 pl-2 text-right text-fg-muted/80 select-none">
                            {r.newNo ?? ''}
                          </td>
                        </>
                      )}
                      <td
                        className={cn(
                          'w-[1%] pl-2 select-none',
                          r.kind === 'add' && 'text-success',
                          r.kind === 'del' && 'text-danger',
                        )}
                      >
                        {r.kind === 'add' ? '+' : r.kind === 'del' ? '-' : ' '}
                      </td>
                      <td className="pr-4 pl-1 whitespace-pre">
                        {highlightText(r.text, query, rowActive?.[i]) || ' '}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </LineClamp>
  )
})
