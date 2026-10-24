import { FileText } from 'lucide-react'
import { memo, useState } from 'react'
import { cn } from '@/lib/utils'
import { ChipHitCount } from './ChipHitCount'
import { chipSearchClass, useChipSearch } from './chipSearch'
import { CHIP } from './chipStyles'
import { TextViewerDialog } from './TextViewerDialog'

type Props = {
  /** Row the prompt renders in (turn id or queued item id); scopes the search hit. */
  rowId?: string
  index: number
  lines: number
  text: string
  className?: string
}

/** "Pasted text #1 · +60 lines" chip; opens the pasted block in a dialog with Copy. */
export const PastedTextChip = memo(function PastedTextChip({ rowId, index, lines, text, className }: Props) {
  const [open, setOpen] = useState(false)
  // Hits inside the pasted block mark the chip (the text itself lives in the dialog).
  const search = useChipSearch(text, rowId, `pasted:${index}`, 'pasted')
  return (
    <>
      <button
        type="button"
        className={cn(CHIP, chipSearchClass(search), className)}
        onClick={() => setOpen(true)}
      >
        <FileText />
        <span className="truncate">
          Pasted text #{index} <span className="text-fg-muted">· +{lines} lines</span>
        </span>
        <ChipHitCount {...search} />
      </button>
      {open && (
        <TextViewerDialog
          open={open}
          onOpenChange={setOpen}
          title={`Pasted text #${index}`}
          description={`${lines} line${lines === 1 ? '' : 's'} · ${text.length.toLocaleString()} characters`}
          text={text}
          activeIndex={search.active}
        />
      )}
    </>
  )
})
