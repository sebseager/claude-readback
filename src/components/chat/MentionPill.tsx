import { AtSign, FileText, Folder } from 'lucide-react'
import { memo, useState } from 'react'
import type { Mention } from '@/lib/transcript/types'
import { cn } from '@/lib/utils'
import { highlightText } from '@/components/common/highlight'
import { ChipHitCount } from './ChipHitCount'
import { chipSearchClass, useChipSearch } from './chipSearch'
import { CHIP, CHIP_STATIC } from './chipStyles'
import { useSearchQuery } from './chatStore'
import { TextViewerDialog } from './TextViewerDialog'

const ICONS = { file: FileText, directory: Folder, pdf: FileText, other: AtSign } as const

/** @-mention pill; opens the attached content (when Claude Code stored it). */
export const MentionPill = memo(function MentionPill({
  mention,
  rowId,
  blockId,
}: {
  mention: Mention
  rowId?: string
  /** Search block id (`mention:<index>`); indexed text is `@path` then the attached content. */
  blockId: string
}) {
  const [open, setOpen] = useState(false)
  const query = useSearchQuery()
  const label = `@${mention.path}`
  const labelSearch = useChipSearch(label, rowId, blockId, 'context')
  const contentSearch = useChipSearch(mention.content ?? '', rowId, blockId, 'context')
  // One running occurrence over "@path\ncontent": split it between the label and the dialog.
  const active = labelSearch.active
  const labelActive = active !== undefined && active < labelSearch.hits ? active : undefined
  const contentActive =
    active !== undefined && labelActive === undefined ? active - labelSearch.hits : undefined
  const inside = { hits: contentSearch.hits, active: contentActive }
  const Icon = ICONS[mention.kind]
  const body = (
    <>
      <Icon />
      <span className="truncate font-mono text-[12px]">{highlightText(label, query, labelActive)}</span>
      <ChipHitCount {...inside} />
    </>
  )
  if (!mention.content) {
    return (
      <span className={CHIP_STATIC} title={mention.path}>
        {body}
      </span>
    )
  }
  return (
    <>
      <button
        type="button"
        className={cn(CHIP, chipSearchClass(inside))}
        title={mention.path}
        onClick={() => setOpen(true)}
      >
        {body}
      </button>
      {open && (
        <TextViewerDialog
          open={open}
          onOpenChange={setOpen}
          title={`@${mention.path}`}
          description={`Attached ${mention.kind} content`}
          text={mention.content}
          activeIndex={contentActive}
        />
      )}
    </>
  )
})
