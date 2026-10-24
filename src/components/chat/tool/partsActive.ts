import { useMemo } from 'react'
import { countMatches, splitActive } from '@/components/common/highlight'
import { toolInputParts, type TextPart } from '@/lib/transcript/searchText'
import type { ToolBlock } from '@/lib/transcript/types'
import { useActiveOccurrence, useSearchQuery, type SearchField } from '../chatStore'

/** Pseudo part key: the occurrence counted over every part after the first. */
export const AFTER_FIRST = '*'

export type PartActive = (key: string) => number | undefined

const NONE: PartActive = () => undefined

/**
 * Ring position per named part of a tool block's input or result. The search index joins the same parts,
 * so the active hit's occurrence is spread over them in order.
 */
export function usePartsActive(parts: TextPart[], blockId: string, field: SearchField): PartActive {
  const active = useActiveOccurrence(blockId, blockId, field)
  const query = useSearchQuery()
  if (active === undefined) return NONE
  const split = splitActive(
    parts.map((p) => p.text),
    query,
    active,
  )
  const byKey = new Map(parts.map((p, i) => [p.key, split[i]]))
  const afterFirst = active - countMatches(parts[0]?.text ?? '', query)
  return (key) => (key === AFTER_FIRST ? (afterFirst >= 0 ? afterFirst : undefined) : byKey.get(key))
}

/** Ring position per input part of a tool block, for the active `tool-input` hit (if any). */
export function useToolInputActive(block: ToolBlock): PartActive {
  const parts = useMemo(() => toolInputParts(block.name, block.input), [block.name, block.input])
  return usePartsActive(parts, block.id, 'tool-input')
}
