import { memo } from 'react'
import type { Block } from '@/lib/transcript/types'
import { FallbackBlock } from './FallbackBlock'
import { TextBlock } from './TextBlock'
import { ThinkingBlock } from './ThinkingBlock'
import { ToolCard } from './tool/ToolCard'
import { UnknownBlock } from './UnknownBlock'

/** One content block of an assistant group. */
export const BlockRenderer = memo(function BlockRenderer({
  block,
  groupLines,
}: {
  block: Block
  groupLines?: number[]
}) {
  switch (block.kind) {
    case 'text':
      return <TextBlock block={block} />
    case 'thinking':
      return <ThinkingBlock block={block} />
    case 'tool':
      return <ToolCard block={block} fallbackLines={groupLines} />
    case 'fallback':
      return <FallbackBlock block={block} />
    case 'unknown':
      return <UnknownBlock block={block} />
  }
})
