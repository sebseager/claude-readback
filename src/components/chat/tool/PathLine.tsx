import { FileText } from 'lucide-react'
import { highlightText } from '@/components/common/highlight'
import { useSearchQuery } from '../chatStore'

/** A file path, mono, with an icon. */
export function PathLine({ path, activeIndex }: { path: string; activeIndex?: number }) {
  const query = useSearchQuery()
  return (
    <div className="flex min-w-0 items-center gap-1.5 font-mono text-[12.5px] text-fg-secondary">
      <FileText className="size-3.5 shrink-0 text-fg-muted" />
      <span className="truncate" title={path}>
        {highlightText(path, query, activeIndex)}
      </span>
    </div>
  )
}
