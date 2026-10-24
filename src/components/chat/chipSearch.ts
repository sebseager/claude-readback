// Search state for chips whose text lives in a dialog (pasted blocks, reminders, mentions): the chip shows
// a match count in a <mark> and a ring when the active hit is inside it; the dialog rings the hit itself.
import { countMatches } from '@/components/common/highlight'
import { cn } from '@/lib/utils'
import { useActiveIn, useSearchQuery, type SearchField } from './chatStore'

export interface ChipSearch {
  hits: number
  /** Occurrence inside the chip's text when the active hit is in it. */
  active?: number
}

export function useChipSearch(
  text: string,
  rowId: string | undefined,
  blockId: string,
  field: SearchField,
): ChipSearch {
  const query = useSearchQuery()
  const active = useActiveIn(rowId ?? '', blockId, field)
  const hits = query.trim() ? countMatches(text, query) : 0
  return { hits, active: rowId === undefined ? undefined : active }
}

export const chipSearchClass = ({ hits, active }: ChipSearch) =>
  cn(hits > 0 && 'border-accent/45', active !== undefined && 'ring-2 ring-accent')
