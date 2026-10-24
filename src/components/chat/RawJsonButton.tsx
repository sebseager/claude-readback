import { Braces } from 'lucide-react'
import { useState } from 'react'
import { IconButton } from '@/components/common/IconButton'
import type { RawRecord } from '@/lib/transcript/types'
import { cn } from '@/lib/utils'
import { useChatContext } from './chatContext'
import { RawJsonDialog } from './RawJsonDialog'

type Props = {
  lines?: number[]
  /** Resolve a prompt's line from its record uuid. */
  uuid?: string
  records?: RawRecord[]
  title?: string
  /** Which named Tailwind group reveals the button on hover. */
  group?: RevealGroup
  className?: string
}

export type RevealGroup = 'row' | 'tool' | 'chip'
const REVEAL: Record<RevealGroup, string> = {
  row: 'group-hover/row:opacity-100',
  tool: 'group-hover/tool:opacity-100',
  chip: 'group-hover/chip:opacity-100',
}

/** Hover action that opens the raw record(s). Hidden until its named group ancestor is hovered or focused. */
export function RawJsonButton({ lines, uuid, records, title, group = 'row', className }: Props) {
  const ctx = useChatContext()
  const [open, setOpen] = useState(false)
  const resolved =
    lines ?? (uuid && ctx ? [ctx.findLineByUuid(uuid)].filter((l): l is number => l !== undefined) : [])
  return (
    <>
      <IconButton
        label="View raw JSON"
        side="top"
        className={cn(
          'size-6 text-fg-muted opacity-0 transition-opacity duration-150 focus-visible:opacity-100 [&_svg]:size-3.5',
          REVEAL[group],
          className,
        )}
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
      >
        <Braces />
      </IconButton>
      {open && (
        <RawJsonDialog
          open={open}
          onOpenChange={setOpen}
          lines={resolved}
          records={records}
          getRaw={ctx?.getRaw}
          title={title}
        />
      )}
    </>
  )
}
