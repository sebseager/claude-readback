import { MemoryStore } from '../lib/store/db'
import { FORK_ID, SUBAGENT_ID, SYNTHETIC_SESSION_ID, allSyntheticFiles, fixtures } from '../test/fixtures'
import { transcriptWorker } from './client'
import { TranscriptService } from './service'

const agentKey = `${SYNTHETIC_SESSION_ID}/subagents/agent-${SUBAGENT_ID}.jsonl`

describe('TranscriptService', () => {
  let svc: TranscriptService
  beforeEach(() => {
    svc = new TranscriptService(new MemoryStore())
  })

  it('ingests a whole session folder and links subagents', async () => {
    const res = await svc.ingest(allSyntheticFiles())
    expect(res.errors).toEqual([])
    expect(res.added.map((s) => s.sessionId)).toEqual([SYNTHETIC_SESSION_ID])
    expect(res.added[0].subagentFilesPresent).toBe(2)
    expect(res.attachedSubagents.map((a) => [a.agentId, a.parentPresent])).toEqual([
      [SUBAGENT_ID, true],
      [FORK_ID, true],
    ])
    const list = await svc.listSessions()
    expect(list).toHaveLength(1)
    const session = await svc.openSession(SYNTHETIC_SESSION_ID)
    expect(session.subagents.find((s) => s.agentId === SUBAGENT_ID)?.fileKey).toBe(agentKey)
    const sub = await svc.openSubagent(agentKey)
    expect(sub.summary.parent).toMatchObject({
      sessionId: SYNTHETIC_SESSION_ID,
      agentId: SUBAGENT_ID,
      toolUseId: 'toolu_01SYNTH00000000015',
    })
  })

  it('attaches a subagent that arrives before its parent, and a meta that arrives before its transcript', async () => {
    const r1 = await svc.ingest([fixtures.agentMeta])
    expect(r1.added).toEqual([])
    const r2 = await svc.ingest([fixtures.agent])
    expect(r2.attachedSubagents).toEqual([
      { sessionId: SYNTHETIC_SESSION_ID, agentId: SUBAGENT_ID, fileKey: agentKey, parentPresent: false },
    ])
    expect(await svc.listSessions()).toEqual([])
    const r3 = await svc.ingest([fixtures.main])
    expect(r3.added[0].subagentFilesPresent).toBe(1)
    const session = await svc.openSession(SYNTHETIC_SESSION_ID)
    expect(session.subagents[0]).toMatchObject({
      fileKey: agentKey,
      agentType: 'general-purpose',
      meta: { spawnDepth: 1 },
    })
  })

  it('updates the stored summary when a subagent arrives after its parent', async () => {
    await svc.ingest([fixtures.main])
    const r = await svc.ingest([fixtures.fork, fixtures.forkMeta])
    expect(r.added).toEqual([])
    expect(r.updated.map((s) => s.subagentFilesPresent)).toEqual([1])
    expect(r.attachedSubagents[0].parentPresent).toBe(true)
    const session = await svc.openSession(SYNTHETIC_SESSION_ID)
    expect(session.turns.find((t) => t.prompt?.command?.name === '/btw')?.subagent?.agentId).toBe(FORK_ID)
  })

  it('searches the opened session and loaded subagents', async () => {
    await svc.ingest(allSyntheticFiles())
    const main = await svc.search(SYNTHETIC_SESSION_ID, 'word-count')
    expect(main.length).toBeGreaterThan(0)
    expect(main.every((m) => m.fileKey === undefined)).toBe(true)
    expect(await svc.search(SYNTHETIC_SESSION_ID, 'cat src/cli.py')).toEqual([])
    await svc.openSubagent(agentKey)
    const sub = await svc.search(SYNTHETIC_SESSION_ID, 'cat src/cli.py')
    expect(sub[0]).toMatchObject({ fileKey: agentKey, field: 'tool-input' })
    expect(await svc.search(SYNTHETIC_SESSION_ID, 'cat src/cli.py', { includeSubagents: false })).toEqual([])
  })

  it('exports and deletes a session with its subagents', async () => {
    await svc.ingest(allSyntheticFiles())
    const files = await svc.exportSession(SYNTHETIC_SESSION_ID)
    expect(files.map((f) => f.name)).toEqual(
      [
        `${SYNTHETIC_SESSION_ID}.jsonl`,
        `${SYNTHETIC_SESSION_ID}/subagents/agent-${SUBAGENT_ID}.jsonl`,
        `${SYNTHETIC_SESSION_ID}/subagents/agent-${SUBAGENT_ID}.meta.json`,
        `${SYNTHETIC_SESSION_ID}/subagents/agent-${FORK_ID}.jsonl`,
        `${SYNTHETIC_SESSION_ID}/subagents/agent-${FORK_ID}.meta.json`,
      ].sort((a, b) =>
        a === `${SYNTHETIC_SESSION_ID}.jsonl`
          ? -1
          : b === `${SYNTHETIC_SESSION_ID}.jsonl`
            ? 1
            : a < b
              ? -1
              : 1,
      ),
    )
    expect(files[0].text).toBe(fixtures.main.text)
    await svc.deleteSession(SYNTHETIC_SESSION_ID)
    expect(await svc.listSessions()).toEqual([])
    expect(await svc.exportSession(SYNTHETIC_SESSION_ID)).toEqual([])
    await expect(svc.openSession(SYNTHETIC_SESSION_ID)).rejects.toThrow(/not stored/)
  })

  it('reports unrecognised files and parse errors', async () => {
    const res = await svc.ingest([{ name: 'notes.txt', text: 'hi' }, fixtures.edge])
    expect(res.errors.map((e) => [e.file, e.line])).toEqual([
      ['notes.txt', undefined],
      ['edge-cases.jsonl', 2],
      ['edge-cases.jsonl', 37],
    ])
    expect(res.added).toHaveLength(1)
  })

  it('links continued-in sessions both ways', async () => {
    const next = '5e55a0de-0000-4000-8000-000000000002'
    const continued = fixtures.edge.text.replaceAll('ed9e0000-0000-4000-8000-000000000001', next)
    await svc.ingest([fixtures.main])
    await svc.ingest([{ name: `${next}.jsonl`, text: continued }])
    const list = await svc.listSessions()
    expect(list.find((s) => s.sessionId === next)?.continuedFromSessionId).toBe(SYNTHETIC_SESSION_ID)
    await svc.ingest([fixtures.main])
    expect((await svc.listSessions()).find((s) => s.sessionId === next)?.continuedFromSessionId).toBe(
      SYNTHETIC_SESSION_ID,
    )
  })

  it('caches at most three folded sessions', async () => {
    await svc.ingest(allSyntheticFiles())
    const a = await svc.openSession(SYNTHETIC_SESSION_ID)
    expect(await svc.openSession(SYNTHETIC_SESSION_ID)).toBe(a)
    await svc.clearAll()
    expect(await svc.listSessions()).toEqual([])
  })
})

describe('transcriptWorker (in-process fallback under jsdom)', () => {
  it('runs the same API without a Worker', async () => {
    const res = await transcriptWorker.ingest([fixtures.main])
    expect(res.added[0].sessionId).toBe(SYNTHETIC_SESSION_ID)
    expect((await transcriptWorker.listSessions()).length).toBe(1)
    await transcriptWorker.clearAll()
  })
})
