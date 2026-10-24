import { memo, useMemo } from 'react'
import { countMatches, highlightText } from '@/components/common/highlight'
import { useSearchQuery } from '../chatStore'
import { CLAMP_LINES, LineClamp } from './LineClamp'

type Props = { id: string; lines: string[]; startLine?: number; title?: string; activeIndex?: number }

/** Code with a line-number gutter (Read results). */
export const CodeView = memo(function CodeView({ id, lines, startLine = 1, title, activeIndex }: Props) {
  const query = useSearchQuery()
  const width = String(startLine + lines.length - 1).length
  // Map the block-level active occurrence to (line, occurrence within that line).
  const activeAt = useMemo(() => locate(lines, query, activeIndex), [activeIndex, lines, query])
  return (
    <LineClamp
      id={id}
      lineCount={lines.length}
      text={() => lines.join('\n')}
      title={title}
      forceAll={activeAt !== undefined && activeAt.line >= CLAMP_LINES}
    >
      {(max) => (
        <div className="scrollbar-thin overflow-x-auto rounded-lg bg-bubble/70 py-2 font-mono text-[12.5px] leading-[1.6]">
          <table className="border-collapse">
            <tbody>
              {lines.slice(0, max).map((line, i) => (
                <tr key={i}>
                  <td
                    className="pr-3 pl-3 text-right align-top text-fg-muted/80 select-none"
                    style={{ minWidth: `${width + 2}ch` }}
                  >
                    {startLine + i}
                  </td>
                  <td className="pr-4 whitespace-pre text-fg">
                    {highlightText(line, query, activeAt?.line === i ? activeAt.index : undefined) || ' '}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </LineClamp>
  )
})

function locate(
  lines: string[],
  query: string,
  activeIndex?: number,
): { line: number; index: number } | undefined {
  if (activeIndex === undefined || !query) return undefined
  let seen = 0
  for (let i = 0; i < lines.length; i++) {
    const n = countMatches(lines[i], query)
    if (activeIndex < seen + n) return { line: i, index: activeIndex - seen }
    seen += n
  }
  return undefined
}
