import { memo } from 'react'
import { StarMark } from '@/components/common/StarMark'
import type { AssistantItem } from '@/lib/transcript/types'
import { cn } from '@/lib/utils'
import { AssistantFooter } from './AssistantFooter'
import { BlockRenderer } from './BlockRenderer'

type Props = {
  item: AssistantItem
  /** Show the avatar: first assistant group of the turn. */
  first?: boolean
}

/** One API response: blocks in order, then the muted usage footer. */
export const AssistantRow = memo(function AssistantRow({ item, first = false }: Props) {
  return (
    <div className="group/row flex gap-3" data-testid="assistant-row">
      <div className="w-6 shrink-0 pt-[3px]">{first && <StarMark className="size-5" title="Claude" />}</div>
      <div className={cn('flex min-w-0 flex-1 flex-col gap-2.5')}>
        {item.blocks.map((b) => (
          <BlockRenderer key={b.id} block={b} groupLines={item.recordLines} />
        ))}
        <AssistantFooter item={item} />
      </div>
    </div>
  )
})
