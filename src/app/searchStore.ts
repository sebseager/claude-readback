// Header search state: the query sent to the worker, its hits, and the selected hit. Selecting a hit sets
// `useChatStore.activeMatch`, which MessageList follows (expand + scroll).
import { create } from 'zustand'
import { useChatStore } from '@/components/chat/chatStore'
import type { SearchMatch } from '@/lib/transcript/types'
import { occurrences, stepIndex, toActiveMatch } from './searchNav'
import { getTranscriptApi } from './sessionStore'

export const SEARCH_LIMIT = 5000

export interface SearchState {
  /** Query the current `matches` belong to. */
  query: string
  sessionId: string | null
  matches: SearchMatch[]
  occ: number[]
  index: number
  searching: boolean
  error?: string
  run: (sessionId: string, query: string) => Promise<void>
  /**
   * Re-run the current query without navigating (a subagent transcript finished loading, so the worker
   * now searches it too). Keeps the selected hit selected when it is still there.
   */
  refresh: () => Promise<void>
  go: (index: number) => void
  next: () => void
  prev: () => void
  clear: () => void
}

let seq = 0

export const useSearchStore = create<SearchState>()((set, get) => ({
  query: '',
  sessionId: null,
  matches: [],
  occ: [],
  index: -1,
  searching: false,
  error: undefined,

  run: async (sessionId, query) => {
    const mine = ++seq
    useChatStore.getState().setSearchQuery(query.trim() ? query : '')
    if (!query.trim()) {
      set({ query: '', sessionId, matches: [], occ: [], index: -1, searching: false, error: undefined })
      return
    }
    set({ searching: true, error: undefined })
    try {
      const matches = await getTranscriptApi().search(sessionId, query, { limit: SEARCH_LIMIT })
      if (mine !== seq) return
      set({ query, sessionId, matches, occ: occurrences(matches), index: -1, searching: false })
      if (matches.length) get().go(0)
    } catch (err) {
      if (mine !== seq) return
      set({
        query,
        sessionId,
        matches: [],
        occ: [],
        index: -1,
        searching: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  },

  refresh: async () => {
    const { query, sessionId } = get()
    if (!sessionId || !query.trim()) return
    const mine = seq
    try {
      const matches = await getTranscriptApi().search(sessionId, query, { limit: SEARCH_LIMIT })
      const cur = get()
      if (mine !== seq || cur.query !== query || cur.sessionId !== sessionId) return
      const occ = occurrences(matches)
      const selected = cur.index >= 0 ? cur.matches[cur.index] : undefined
      const selectedOcc = cur.index >= 0 ? cur.occ[cur.index] : undefined
      const index = selected
        ? matches.findIndex(
            (m, i) =>
              occ[i] === selectedOcc &&
              m.rowId === selected.rowId &&
              m.blockId === selected.blockId &&
              m.field === selected.field &&
              m.fileKey === selected.fileKey,
          )
        : -1
      set({ matches, occ, index })
    } catch {
      /* keep the previous results */
    }
  },

  go: (index) => {
    const { matches, occ } = get()
    if (index < 0 || index >= matches.length) return
    set({ index })
    useChatStore.getState().setActiveMatch(toActiveMatch(matches[index], occ[index]))
  },
  next: () => get().go(stepIndex(get().index, get().matches.length, 1)),
  prev: () => get().go(stepIndex(get().index, get().matches.length, -1)),
  clear: () => {
    seq++
    useChatStore.getState().setSearchQuery('')
    set({ query: '', matches: [], occ: [], index: -1, searching: false, error: undefined })
  },
}))
