// Per-view UI state of the message list: expand/collapse, search query + active hit, hidden context.
// Lives outside the rows so it survives virtualization (rows unmount when scrolled away).
import { useCallback, useContext, useEffect } from 'react'
import { create } from 'zustand'
import type { SearchEntry } from '@/lib/transcript/types'
import { ChatContext } from './chatContext'

export type SearchField = SearchEntry['field']

export interface ActiveMatch {
  /** Row id (turn id, item id, block id or hidden-context item id) to scroll to. */
  rowId: string
  /** Card to expand inside the row (tool block, thinking block…). */
  blockId?: string
  /** Which text of the row/block (prompt, tool-input, tool-result…), when known. */
  field?: SearchField
  /** 0-based occurrence of the query inside that row/block's rendered text. */
  occurrence: number
  /** Set when the hit is inside a loaded subagent transcript (its storage key); ids are then that session's. */
  fileKey?: string
  /** Bumped on every navigation so re-selecting the same hit scrolls again. */
  seq: number
}

export interface ChatState {
  /** Explicit expand/collapse choices keyed by row id or block id. Absent → component default. */
  expanded: Record<string, boolean>
  searchQuery: string
  activeMatch: ActiveMatch | null
  /** Global default for the "N context items" toggles (wire this to settings). */
  showHiddenContextDefault: boolean
  /** Per-turn overrides of `showHiddenContextDefault`. */
  hiddenContextOverrides: Record<string, boolean>

  setExpanded: (id: string, open: boolean) => void
  toggleExpanded: (id: string, defaultOpen?: boolean) => void
  setSearchQuery: (query: string) => void
  setActiveMatch: (match: Omit<ActiveMatch, 'seq'> | null) => void
  setShowHiddenContextDefault: (show: boolean) => void
  setHiddenContextShown: (turnId: string, show: boolean) => void
  /** Clears expansion + hidden-context overrides (call when the session changes). */
  resetView: () => void
}

export const useChatStore = create<ChatState>()((set) => ({
  expanded: {},
  searchQuery: '',
  activeMatch: null,
  showHiddenContextDefault: false,
  hiddenContextOverrides: {},

  setExpanded: (id, open) => set((s) => ({ expanded: { ...s.expanded, [id]: open } })),
  toggleExpanded: (id, defaultOpen = false) =>
    set((s) => ({ expanded: { ...s.expanded, [id]: !(s.expanded[id] ?? defaultOpen) } })),
  setSearchQuery: (searchQuery) => set({ searchQuery, activeMatch: null }),
  setActiveMatch: (match) =>
    set((s) => ({ activeMatch: match ? { ...match, seq: (s.activeMatch?.seq ?? 0) + 1 } : null })),
  setShowHiddenContextDefault: (showHiddenContextDefault) => set({ showHiddenContextDefault }),
  setHiddenContextShown: (turnId, show) =>
    set((s) => ({ hiddenContextOverrides: { ...s.hiddenContextOverrides, [turnId]: show } })),
  resetView: () => set({ expanded: {}, hiddenContextOverrides: {}, activeMatch: null }),
}))

/** `[open, toggle]` for a card. `defaultOpen` applies until the user toggles it. */
export function useExpanded(id: string, defaultOpen = false): [boolean, () => void] {
  const open = useChatStore((s) => s.expanded[id] ?? defaultOpen)
  const toggleExpanded = useChatStore((s) => s.toggleExpanded)
  const toggle = useCallback(() => toggleExpanded(id, defaultOpen), [toggleExpanded, id, defaultOpen])
  return [open, toggle]
}

export function useHiddenContextShown(turnId: string): boolean {
  return useChatStore((s) => s.hiddenContextOverrides[turnId] ?? s.showHiddenContextDefault)
}

export function useSearchQuery(): string {
  return useChatStore((s) => s.searchQuery)
}

/**
 * The active occurrence index when the active search hit points at this row (and block, if given),
 * else undefined. Lets each renderer ring the right `<mark>`. Hits from another transcript (main vs a
 * nested subagent) never match.
 */
export function useActiveOccurrence(
  rowId: string,
  blockId?: string,
  field?: SearchField | SearchField[],
): number | undefined {
  const fileKey = useContext(ChatContext)?.fileKey
  return useChatStore((s) => {
    const m = s.activeMatch
    if (!m || m.fileKey !== fileKey) return undefined
    if (field !== undefined && m.field !== undefined) {
      const ok = Array.isArray(field) ? field.includes(m.field) : field === m.field
      if (!ok) return undefined
    }
    if (blockId !== undefined) return m.blockId === blockId || m.rowId === blockId ? m.occurrence : undefined
    return m.rowId === rowId && m.blockId === undefined ? m.occurrence : undefined
  })
}

/** Like useActiveOccurrence, but row and block must both match exactly (chips whose ids repeat per row). */
export function useActiveIn(rowId: string, blockId: string, field: SearchField): number | undefined {
  const fileKey = useContext(ChatContext)?.fileKey
  return useChatStore((s) => {
    const m = s.activeMatch
    if (!m || m.fileKey !== fileKey || m.field !== field) return undefined
    return m.rowId === rowId && m.blockId === blockId ? m.occurrence : undefined
  })
}

/** Opens the collapsible `id` whenever a search jump lands inside it (`active` defined). */
export function useRevealWhenActive(id: string, active: number | undefined): void {
  const seq = useChatStore((s) => (active !== undefined ? s.activeMatch?.seq : undefined))
  const setExpanded = useChatStore((s) => s.setExpanded)
  useEffect(() => {
    if (seq !== undefined) setExpanded(id, true)
  }, [seq, id, setExpanded])
}
