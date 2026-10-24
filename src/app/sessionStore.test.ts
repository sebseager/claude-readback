import { FORK_ID, SUBAGENT_ID, SYNTHETIC_SESSION_ID, fixtures } from '@/test/fixtures'
import { asFile, resetSessionStore, syntheticCopy, syntheticFiles } from '@/test/sessions'
import type { TranscriptService } from '@/workers/service'
import { LRU_SIZE, cachedSessionIds, describeIngest, useSessionStore } from './sessionStore'

const ids = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
]
const agentKey = (id: string) => `${SYNTHETIC_SESSION_ID}/subagents/agent-${id}.jsonl`
const store = () => useSessionStore.getState()

let svc: TranscriptService
beforeEach(() => {
  svc = resetSessionStore()
})

describe('ingestFiles', () => {
  it('stores a session folder, attaches its subagents and opens the session', async () => {
    const out = await store().ingestFiles(syntheticFiles())
    expect(out).toMatchObject({ attached: 2, errors: [], skipped: [], activated: SYNTHETIC_SESSION_ID })
    expect(out?.added.map((s) => s.sessionId)).toEqual([SYNTHETIC_SESSION_ID])
    expect(store().sessions.map((s) => s.sessionId)).toEqual([SYNTHETIC_SESSION_ID])
    expect(store().activeSessionId).toBe(SYNTHETIC_SESSION_ID)
    expect(store().activeSession?.subagents.find((s) => s.agentId === SUBAGENT_ID)?.fileKey).toBe(
      agentKey(SUBAGENT_ID),
    )
    expect(store().ingesting).toBeNull()
  })

  it('skips files that are not transcripts', async () => {
    expect(await store().ingestFiles([asFile({ name: 'notes.txt', text: 'hi' })])).toBeUndefined()
    const out = await store().ingestFiles([asFile({ name: 'notes.txt', text: 'hi' }), ...syntheticFiles()])
    expect(out?.skipped).toEqual(['notes.txt'])
  })

  it('keeps an orphan subagent and opens its parent once the parent arrives', async () => {
    const orphan = await store().ingestFiles([asFile(fixtures.agent)])
    expect(orphan?.attached).toBe(1)
    expect(orphan?.activated).toBeUndefined()
    expect(store().sessions).toEqual([])
    expect(store().activeSessionId).toBeNull()

    const parent = await store().ingestFiles([asFile(fixtures.main, `${SYNTHETIC_SESSION_ID}.jsonl`)])
    expect(parent?.activated).toBe(SYNTHETIC_SESSION_ID)
    expect(store().sessions[0].subagentFilesPresent).toBe(1)
  })

  it('activates (and refreshes) the parent of a subagent dropped later', async () => {
    await store().ingestFiles([syntheticCopy(ids[0]), asFile(fixtures.main, `${SYNTHETIC_SESSION_ID}.jsonl`)])
    await store().open(ids[0])
    const out = await store().ingestFiles([asFile(fixtures.fork), asFile(fixtures.forkMeta)])
    expect(out?.activated).toBe(SYNTHETIC_SESSION_ID)
    expect(store().activeSessionId).toBe(SYNTHETIC_SESSION_ID)
    expect(store().activeSession?.subagents.find((s) => s.agentId === FORK_ID)?.fileKey).toBe(
      agentKey(FORK_ID),
    )
  })

  it('activates the newest of several added sessions', async () => {
    const out = await store().ingestFiles([syntheticCopy(ids[1]), syntheticCopy(ids[0])])
    expect(out?.added).toHaveLength(2)
    // Same startedAt: the list order (then session id) decides.
    expect(store().sessions.map((s) => s.sessionId)).toEqual([ids[0], ids[1]])
    expect(store().activeSessionId).toBe(out?.activated)
  })
})

describe('open', () => {
  it(`keeps the last ${LRU_SIZE} sessions in memory`, async () => {
    await store().ingestFiles(ids.map(syntheticCopy))
    const spy = vi.spyOn(svc, 'openSession')
    for (const id of ids) await store().open(id)
    expect(cachedSessionIds()).toEqual(ids.slice(1))
    const calls = spy.mock.calls.length

    await store().open(ids[2]) // cached: no worker round-trip
    expect(spy.mock.calls.length).toBe(calls)
    expect(store().activeSession?.summary.sessionId).toBe(ids[2])
    expect(cachedSessionIds().at(-1)).toBe(ids[2])

    await store().open(ids[0]) // evicted: re-read
    expect(spy.mock.calls.length).toBe(calls + 1)
    expect(cachedSessionIds()).toEqual([ids[3], ids[2], ids[0]])
  })

  it('reports a session that cannot be opened', async () => {
    await store().open('nope')
    expect(store()).toMatchObject({ activeSessionId: 'nope', loading: false, activeSession: undefined })
    expect(store().error).toMatch(/not stored/)
  })

  it('ignores a slow open that was superseded', async () => {
    await store().ingestFiles([syntheticCopy(ids[0]), syntheticCopy(ids[1])])
    const real = svc.openSession.bind(svc)
    vi.spyOn(svc, 'openSession').mockImplementation(async (id) => {
      if (id === ids[0]) await new Promise((r) => setTimeout(r, 30))
      return real(id)
    })
    const first = store().open(ids[0], { force: true })
    await store().open(ids[1], { force: true })
    await first
    expect(store().activeSession?.summary.sessionId).toBe(ids[1])
  })
})

describe('library', () => {
  it('refreshList picks up changes made behind the store', async () => {
    await svc.ingest([fixtures.main])
    expect(store().sessions).toEqual([])
    await store().refreshList()
    expect(store().sessions.map((s) => s.sessionId)).toEqual([SYNTHETIC_SESSION_ID])
    expect(store().listLoaded).toBe(true)
  })

  it('boot opens the last viewed session, else the newest', async () => {
    await svc.ingest(ids.slice(0, 2).map((id) => ({ name: `${id}.jsonl`, text: fixtures.main.text })))
    await store().boot()
    expect(store().activeSessionId).toBe(ids[0])

    resetSessionStore()
    // Same library, new page load with a remembered session.
    const svc2 = resetSessionStore()
    await svc2.ingest(ids.slice(0, 2).map((id) => ({ name: `${id}.jsonl`, text: fixtures.main.text })))
    localStorage.setItem('cc-viewer:last-session', ids[1])
    await store().boot()
    expect(store().activeSessionId).toBe(ids[1])
  })

  it('remove deletes the session and moves to the next one', async () => {
    await store().ingestFiles([syntheticCopy(ids[0]), syntheticCopy(ids[1])])
    await store().open(ids[0])
    await store().remove(ids[0])
    expect(store().sessions.map((s) => s.sessionId)).toEqual([ids[1]])
    expect(store().activeSessionId).toBe(ids[1])
    expect(cachedSessionIds()).not.toContain(ids[0])
  })

  it('clearAll empties the library and the view', async () => {
    await store().ingestFiles(syntheticFiles())
    await store().clearAll()
    expect(store()).toMatchObject({ sessions: [], activeSessionId: null, activeSession: undefined })
    expect(cachedSessionIds()).toEqual([])
  })
})

describe('openSubagent', () => {
  it('loads a subagent transcript once, even when asked twice', async () => {
    await store().ingestFiles(syntheticFiles())
    const spy = vi.spyOn(svc, 'openSubagent')
    const [a, b] = await Promise.all([
      store().openSubagent(agentKey(SUBAGENT_ID)),
      store().openSubagent(agentKey(SUBAGENT_ID)),
    ])
    expect(a).toBe(b)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(store().subagentSessions[agentKey(SUBAGENT_ID)]?.summary.parent?.agentId).toBe(SUBAGENT_ID)
    // Switching sessions drops the loaded subagents.
    await store().ingestFiles([syntheticCopy(ids[0])])
    expect(store().subagentSessions).toEqual({})
  })

  it('records a load error', async () => {
    await store().ingestFiles(syntheticFiles())
    await store().openSubagent('missing/subagents/agent-x.jsonl')
    expect(store().subagentErrors['missing/subagents/agent-x.jsonl']).toMatch(/not stored/)
  })
})

describe('describeIngest', () => {
  const s = { sessionId: 'x' } as never
  it('summarizes an ingest', () => {
    expect(describeIngest({ added: [s], updated: [], attached: 3 })).toBe(
      'Added 1 session · attached 3 subagents',
    )
    expect(describeIngest({ added: [s, s], updated: [], attached: 0 })).toBe('Added 2 sessions')
    expect(describeIngest({ added: [], updated: [s], attached: 1 })).toBe('Attached 1 subagent')
    expect(describeIngest({ added: [], updated: [s], attached: 0 })).toBe('Updated 1 session')
  })
})
