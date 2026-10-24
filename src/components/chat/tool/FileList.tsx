import { FileText } from 'lucide-react'
import { memo } from 'react'
import { highlightText, splitActive } from '@/components/common/highlight'
import { useSearchQuery } from '../chatStore'
import { LineClamp } from './LineClamp'

/** Mono list of paths (Grep files_with_matches, Glob). */
export const FileList = memo(function FileList({
  id,
  files,
  title = 'Files',
  activeIndex,
}: {
  id: string
  files: string[]
  title?: string
  /** Search occurrence to ring, counted over the paths in order. */
  activeIndex?: number
}) {
  const query = useSearchQuery()
  const active = activeIndex === undefined ? undefined : splitActive(files, query, activeIndex)
  if (files.length === 0) return <p className="text-[12.5px] text-fg-muted italic">No files</p>
  return (
    <LineClamp
      id={id}
      lineCount={files.length}
      text={() => files.join('\n')}
      title={title}
      forceAll={activeIndex !== undefined}
    >
      {(max) => (
        <ul className="flex flex-col rounded-lg bg-bubble/70 py-1.5 font-mono text-[12.5px]">
          {files.slice(0, max).map((f, i) => (
            <li key={i} className="flex min-w-0 items-center gap-2 px-3 py-0.5 text-fg-secondary">
              <FileText className="size-3.5 shrink-0 text-fg-muted" />
              <span className="truncate" title={f}>
                {highlightText(f, query, active?.[i])}
              </span>
            </li>
          ))}
        </ul>
      )}
    </LineClamp>
  )
})
