import { Braces, ChevronRight } from 'lucide-react'
import { memo } from 'react'
import type { UnknownBlock as UnknownBlockData } from '@/lib/transcript/types'
import { cn } from '@/lib/utils'
import { useExpanded } from './chatStore'
import { CHIP } from './chipStyles'
import { ClampedText } from './tool/ClampedText'
import { asRecord, asString, prettyJson } from './util'

/** A content block type this viewer doesn't know: a chip with the raw JSON behind it. */
export const UnknownBlock = memo(function UnknownBlock({ block }: { block: UnknownBlockData }) {
  const [open, toggle] = useExpanded(block.id, false)
  const type = asString(asRecord(block.raw)?.type) ?? 'unknown'
  return (
    <div className="flex flex-col items-start gap-1.5" data-testid="unknown-block">
      <button type="button" aria-expanded={open} onClick={toggle} className={CHIP}>
        <Braces />
        Unrecognised block <span className="font-mono text-[12px] text-fg-muted">{type}</span>
        <ChevronRight className={cn('transition-transform duration-150', open && 'rotate-90')} />
      </button>
      {open && (
        <div className="w-full">
          <ClampedText id={block.id} text={prettyJson(block.raw)} tone="muted" title={`${type} block`} />
        </div>
      )}
    </div>
  )
})
