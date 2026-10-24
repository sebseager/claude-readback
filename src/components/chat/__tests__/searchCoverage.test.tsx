// Every indexed field must render a ringed <mark> for the active hit: walk a session's index, activate the
// first and last occurrence of each entry group, render its row, and look for the ring.
import { act, cleanup } from '@testing-library/react'
import { occurrences, toActiveMatch } from '@/app/searchNav'
import { foldSession } from '@/lib/transcript/fold'
import { buildMockSession } from '@/lib/transcript/mock'
import { parseJsonl } from '@/lib/transcript/parse'
import { searchSession } from '@/lib/transcript/search'
import type { SearchMatch, Session } from '@/lib/transcript/types'
import { fixtures } from '@/test/fixtures'
import { useChatStore } from '../chatStore'
import { RowRenderer } from '../RowRenderer'
import { buildRows } from '../rows'
import { renderInChat, resetChatStore } from './testUtils'

const SUBJECTS: [string, Session][] = [
  ['mock session', buildMockSession()],
  ['synthetic fixture', foldSession(parseJsonl(fixtures.main.text).records)],
  ['edge-case fixture', foldSession(parseJsonl(fixtures.edge.text).records)],
]

/** First and last occurrence of each (row, block, field) group. */
function samples(session: Session, query: string) {
  const matches = searchSession(session.searchIndex, query)
  const occ = occurrences(matches)
  const byGroup = new Map<string, number[]>()
  matches.forEach((m, i) => {
    const k = `${m.rowId}|${m.blockId ?? ''}|${m.field}`
    const list = byGroup.get(k) ?? []
    list.push(i)
    byGroup.set(k, list)
  })
  return [...byGroup.values()].flatMap((list) =>
    [...new Set([list[0], list[list.length - 1]])].map((i) => ({ m: matches[i], occ: occ[i] })),
  )
}

function ringed(session: Session, query: string, m: SearchMatch, occ: number): boolean {
  const { rows, indexById } = buildRows(session)
  const ctx = m.blockId?.startsWith('ctx:') ? m.blockId.slice(4) : undefined
  const at =
    (ctx !== undefined ? indexById.get(ctx) : undefined) ??
    indexById.get(m.rowId) ??
    (m.blockId ? indexById.get(m.blockId) : undefined)
  const row = at === undefined ? undefined : rows[at]
  if (!row) return false
  resetChatStore()
  const s = useChatStore.getState()
  s.setSearchQuery(query)
  // What MessageList's search jump does before scrolling.
  if (m.blockId) s.setExpanded(m.blockId, true)
  if (row.kind === 'hidden-context-toggle') s.setHiddenContextShown(row.turnId, true)
  else if (row.kind !== 'item' || row.item.kind !== 'assistant') s.setExpanded(row.id, true)
  s.setActiveMatch(toActiveMatch(m, occ))
  const { container } = renderInChat(<RowRenderer row={row} />, session)
  act(() => {})
  const ok = container.querySelector('[data-search-active]') !== null
  cleanup()
  return ok
}

const describeMatch = ({ m, occ }: { m: SearchMatch; occ: number }) =>
  `${m.field} ${m.rowId} ${m.blockId ?? ''} #${occ}: …${m.snippet.before.slice(-20)}[${m.snippet.match}]${m.snippet.after.slice(0, 20)}…`

describe.each(SUBJECTS)('search highlight coverage: %s', (_name, session) => {
  // Markdown renders a transformed text (link targets and emphasis markers vanish), so its occurrence
  // counts are approximate: only the first hit must ring. Everything else must ring exactly.
  const markdownTurns = new Set(
    session.turns
      .filter(
        (t) => t.kind === 'agent-message' || t.kind === 'compact-summary' || t.kind === 'task-notification',
      )
      .map((t) => t.id),
  )
  const approximate = (m: SearchMatch) =>
    m.field === 'assistant' || m.field === 'thinking' || (m.field === 'prompt' && markdownTurns.has(m.rowId))

  it.each(['e', 'a', 'the', 'ts'])('rings the active hit for %j', (query) => {
    const all = samples(session, query)
    const missing = all
      .filter(({ m, occ }) => !approximate(m) || occ === 0)
      .filter(({ m, occ }) => !ringed(session, query, m, occ))
      .map(describeMatch)
    expect(missing).toEqual([])
  })

  it('samples every field the session has', () => {
    const indexed = new Set(session.searchIndex.map((e) => e.field))
    const sampled = new Set(samples(session, 'e').map(({ m }) => m.field))
    for (const f of indexed) expect(sampled.has(f), f).toBe(true)
  })
})
