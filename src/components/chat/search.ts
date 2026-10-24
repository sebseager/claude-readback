// Search hits over Session.searchIndex and a small navigation hook. The header owns the input; this
// module turns a query into hits and drives `useChatStore.activeMatch`.
import { useCallback, useMemo, useState } from 'react'
import { countMatches } from '@/components/common/highlight'
import type { SearchEntry, Session } from '@/lib/transcript/types'
import { useChatStore } from './chatStore'

export interface SearchHit {
  rowId: string
  blockId?: string
  field: SearchEntry['field']
  /** Occurrence within this entry's text. */
  occurrence: number
}

const MAX_HITS = 10_000

export function computeSearchHits(session: Session, query: string): SearchHit[] {
  const q = query.trim()
  if (!q) return []
  const hits: SearchHit[] = []
  for (const e of session.searchIndex) {
    const n = countMatches(e.text, q)
    for (let i = 0; i < n && hits.length < MAX_HITS; i++) {
      hits.push({ rowId: e.rowId, blockId: e.blockId, field: e.field, occurrence: i })
    }
    if (hits.length >= MAX_HITS) break
  }
  return hits
}

/**
 * Reads `searchQuery` from the chat store, computes hits, and exposes next/prev that set `activeMatch`
 * (MessageList scrolls + expands in response). `index` is -1 until the first jump.
 */
export function useSearchNavigation(session: Session | undefined) {
  const query = useChatStore((s) => s.searchQuery)
  const setActiveMatch = useChatStore((s) => s.setActiveMatch)
  const hits = useMemo(() => (session ? computeSearchHits(session, query) : []), [session, query])
  // The selection resets whenever the hit list changes (new query or session).
  const [selection, setSelection] = useState<{ hits: SearchHit[]; index: number }>({ hits, index: -1 })
  const index = selection.hits === hits ? selection.index : -1

  const go = useCallback(
    (i: number) => {
      if (hits.length === 0) return
      const next = ((i % hits.length) + hits.length) % hits.length
      setSelection({ hits, index: next })
      const h = hits[next]
      setActiveMatch({ rowId: h.rowId, blockId: h.blockId, field: h.field, occurrence: h.occurrence })
    },
    [hits, setActiveMatch],
  )
  const next = useCallback(() => go(index + 1), [go, index])
  const prev = useCallback(() => go(index < 0 ? -1 : index - 1), [go, index])
  return { query, hits, index, next, prev, go }
}
