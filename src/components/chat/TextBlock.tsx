import { memo } from 'react'
import type { TextBlock as TextBlockData } from '@/lib/transcript/types'
import { useActiveOccurrence } from './chatStore'
import { Markdown } from './Markdown'

/** Assistant prose. */
export const TextBlock = memo(function TextBlock({ block }: { block: TextBlockData }) {
  const active = useActiveOccurrence(block.id, block.id, 'assistant')
  return <Markdown markdown={block.markdown} activeIndex={active} />
})
