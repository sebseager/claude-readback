import { Maximize2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { useExpanded } from '../chatStore'
import { TextViewerDialog } from '../TextViewerDialog'

export const CLAMP_LINES = 40
/** Even "Show all" stops here; the dialog has everything. */
export const MAX_INLINE_LINES = 2000

type Props = {
  /** Expansion key; "Show all" survives virtualization. */
  id: string
  lineCount: number
  /** Full text for the dialog (lazy for big payloads). */
  text: string | (() => string)
  title?: string
  limit?: number
  /** Show everything regardless of the clamp (e.g. the active search hit lives in here). */
  forceAll?: boolean
  /** Renders the content showing at most `maxLines` lines. */
  children: (maxLines: number) => ReactNode
}

/** Clamps long content at 40 lines with "Show all (N lines)" and an "Open" full-text dialog. */
export function LineClamp({
  id,
  lineCount,
  text,
  title = 'Output',
  limit = CLAMP_LINES,
  forceAll = false,
  children,
}: Props) {
  const [all, toggle] = useExpanded(`${id}:all`, false)
  const [viewer, setViewer] = useState(false)
  const long = lineCount > limit
  const max = long && !all && !forceAll ? limit : MAX_INLINE_LINES
  return (
    <div>
      {children(max)}
      {long && (
        <div className="mt-1 flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="xs"
            className="text-fg-muted hover:bg-hover hover:text-fg"
            onClick={toggle}
          >
            {all ? 'Show less' : `Show all (${lineCount.toLocaleString()} lines)`}
          </Button>
          <Button
            variant="ghost"
            size="xs"
            className="text-fg-muted hover:bg-hover hover:text-fg"
            onClick={() => setViewer(true)}
          >
            <Maximize2 />
            Open
          </Button>
          {all && lineCount > MAX_INLINE_LINES && (
            <span className="text-[11.5px] text-fg-muted">
              Showing {MAX_INLINE_LINES.toLocaleString()} lines inline
            </span>
          )}
        </div>
      )}
      {viewer && (
        <TextViewerDialog
          open={viewer}
          onOpenChange={setViewer}
          title={title}
          description={`${lineCount.toLocaleString()} lines`}
          text={typeof text === 'function' ? text() : text}
        />
      )}
    </div>
  )
}
