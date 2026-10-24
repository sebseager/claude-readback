import type { ReactNode } from 'react'
import { CopyButton } from '@/components/common/CopyButton'
import { highlightText } from '@/components/common/highlight'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useSearchQuery } from './chatStore'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  text: string
  /** Search occurrence to ring (the active hit lives in this text). */
  activeIndex?: number
}

/** Full-size mono viewer for long text (pasted blocks, tool output, raw JSON) with a Copy button. */
export function TextViewerDialog({ open, onOpenChange, title, description, text, activeIndex }: Props) {
  const query = useSearchQuery()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-3 bg-main p-5 sm:max-w-4xl">
        <DialogHeader className="pr-8">
          <DialogTitle className="font-sans text-[15px] font-semibold">{title}</DialogTitle>
          <DialogDescription className={description ? 'text-[12.5px]' : 'sr-only'}>
            {description ?? 'Full text'}
          </DialogDescription>
        </DialogHeader>
        <pre className="scrollbar-thin max-h-[70vh] min-h-0 overflow-auto rounded-lg border border-border bg-bubble/60 p-3 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap wrap-anywhere text-fg">
          {highlightText(text, query, activeIndex)}
        </pre>
        <div className="flex justify-end">
          <CopyButton text={text} showLabel className="h-7 px-2.5 text-[12.5px]" />
        </div>
      </DialogContent>
    </Dialog>
  )
}
