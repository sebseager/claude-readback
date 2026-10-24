import { SUBAGENT_ID, SYNTHETIC_SESSION_ID } from '@/test/fixtures'
import { resetSessionStore, syntheticFiles } from '@/test/sessions'
import { useSearchStore } from './searchStore'
import { useSessionStore } from './sessionStore'

const agentKey = `${SYNTHETIC_SESSION_ID}/subagents/agent-${SUBAGENT_ID}.jsonl`

beforeEach(() => {
  resetSessionStore()
  useSearchStore.getState().clear()
})

describe('searchStore.refresh', () => {
  it('adds hits from a subagent transcript loaded after the search ran, keeping the selection', async () => {
    await useSessionStore.getState().ingestFiles(syntheticFiles())
    const search = useSearchStore.getState()
    await search.run(SYNTHETIC_SESSION_ID, 'placeholder')
    const before = useSearchStore.getState()
    expect(before.matches.length).toBeGreaterThan(0)
    expect(before.matches.some((m) => m.fileKey === agentKey)).toBe(false)
    expect(before.index).toBe(0)
    const selected = before.matches[0]

    await useSessionStore.getState().openSubagent(agentKey)
    await useSearchStore.getState().refresh()

    const after = useSearchStore.getState()
    expect(after.matches.some((m) => m.fileKey === agentKey)).toBe(true)
    expect(after.matches.length).toBeGreaterThan(before.matches.length)
    expect(after.matches[after.index]).toMatchObject({ rowId: selected.rowId, field: selected.field })
  })
})
