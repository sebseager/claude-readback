import { Repeat } from 'lucide-react'
import { memo } from 'react'
import type { FallbackBlock as FallbackBlockData } from '@/lib/transcript/types'
import { sequentialHighlighter } from '@/components/common/highlight'
import { useActiveOccurrence, useSearchQuery } from './chatStore'
import { CHIP_STATIC } from './chipStyles'

/** The API switched models mid-request. */
export const FallbackBlock = memo(function FallbackBlock({ block }: { block: FallbackBlockData }) {
  // Indexed as "Model fell back from <from> to <to>"; highlighted piece by piece in that order.
  const hl = sequentialHighlighter(useSearchQuery(), useActiveOccurrence(block.id, block.id, 'event'))
  return (
    <span className={CHIP_STATIC} data-testid="fallback-block">
      <Repeat />
      {hl('Model fell back from ')}
      <span className="font-mono text-[12px]">{hl(block.from)}</span>
      {hl(' to ')}
      <span className="font-mono text-[12px]">{hl(block.to)}</span>
    </span>
  )
})
