// Pure helpers for the header's session search: stepping through hits and mapping them to ActiveMatch.
import type { ActiveMatch } from '@/components/chat/chatStore'
import type { SearchMatch } from '@/lib/transcript/types'

/** Next index with wraparound; from "nothing selected" (-1), next → first and prev → last. */
export function stepIndex(index: number, count: number, dir: 1 | -1): number {
  if (count <= 0) return -1
  if (index < 0) return dir === 1 ? 0 : count - 1
  return (((index + dir) % count) + count) % count
}

const groupKey = (m: SearchMatch) =>
  `${m.fileKey ?? ''}\u0000${m.rowId}\u0000${m.blockId ?? ''}\u0000${m.field}`

/**
 * Occurrence of each match within its row/block/field (what the renderers count when ringing a `<mark>`).
 * Matches arrive in document order, so a running counter per group is enough.
 */
export function occurrences(matches: readonly SearchMatch[]): number[] {
  const seen = new Map<string, number>()
  return matches.map((m) => {
    const k = groupKey(m)
    const n = seen.get(k) ?? 0
    seen.set(k, n + 1)
    return n
  })
}

export function toActiveMatch(m: SearchMatch, occurrence: number): Omit<ActiveMatch, 'seq'> {
  const out: Omit<ActiveMatch, 'seq'> = { rowId: m.rowId, field: m.field, occurrence }
  if (m.blockId !== undefined) out.blockId = m.blockId
  if (m.fileKey !== undefined) out.fileKey = m.fileKey
  return out
}

/** "k/N", "0/0" for no hits, "" when there is no query; `+` marks a capped result list. */
export function counterLabel(query: string, index: number, count: number, capped = false): string {
  if (!query.trim()) return ''
  const n = `${count}${capped ? '+' : ''}`
  return `${index < 0 ? 0 : index + 1}/${n}`
}
