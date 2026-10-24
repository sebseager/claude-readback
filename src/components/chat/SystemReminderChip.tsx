import { Info } from 'lucide-react'
import { memo, useState } from 'react'
import { cn } from '@/lib/utils'
import { ChipHitCount } from './ChipHitCount'
import { chipSearchClass, useChipSearch } from './chipSearch'
import { CHIP } from './chipStyles'
import { TextViewerDialog } from './TextViewerDialog'

/** A <system-reminder> that rode along with the prompt: a quiet chip, never inline text. */
export const SystemReminderChip = memo(function SystemReminderChip({
  text,
  rowId,
  blockId,
}: {
  text: string
  rowId?: string
  /** Search block id (`sr:<segment index>`). */
  blockId: string
}) {
  const [open, setOpen] = useState(false)
  const search = useChipSearch(text, rowId, blockId, 'context')
  return (
    <>
      <button
        type="button"
        className={cn(CHIP, 'border-dashed text-fg-muted', chipSearchClass(search))}
        onClick={() => setOpen(true)}
      >
        <Info />
        system reminder
        <ChipHitCount {...search} />
      </button>
      {open && (
        <TextViewerDialog
          open={open}
          onOpenChange={setOpen}
          title="System reminder"
          description="Injected by Claude Code alongside the prompt"
          text={text}
          activeIndex={search.active}
        />
      )}
    </>
  )
})
