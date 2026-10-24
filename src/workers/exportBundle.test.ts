import { strFromU8, unzipSync } from 'fflate'
import { MemoryStore } from '../lib/store/db'
import { SUBAGENT_ID, SYNTHETIC_SESSION_ID, allSyntheticFiles, fixtures } from '../test/fixtures'
import { TranscriptService } from './service'

describe('exportBundle', () => {
  it('exports a lone transcript as <sessionId>.jsonl', async () => {
    const svc = new TranscriptService(new MemoryStore())
    await svc.ingest([fixtures.main])
    const b = await svc.exportBundle(SYNTHETIC_SESSION_ID)
    expect(b).toMatchObject({
      fileName: `${SYNTHETIC_SESSION_ID}.jsonl`,
      fileCount: 1,
      data: fixtures.main.text,
    })
  })

  it('zips a session with subagents in the original folder layout', async () => {
    const svc = new TranscriptService(new MemoryStore())
    await svc.ingest(allSyntheticFiles())
    const b = await svc.exportBundle(SYNTHETIC_SESSION_ID)
    expect(b.fileName).toBe(`${SYNTHETIC_SESSION_ID}.zip`)
    const files = unzipSync(b.data as Uint8Array)
    expect(Object.keys(files).sort()).toEqual(
      [
        `${SYNTHETIC_SESSION_ID}.jsonl`,
        `${SYNTHETIC_SESSION_ID}/subagents/agent-${SUBAGENT_ID}.jsonl`,
        `${SYNTHETIC_SESSION_ID}/subagents/agent-${SUBAGENT_ID}.meta.json`,
        `${SYNTHETIC_SESSION_ID}/subagents/agent-awhat-is-wc-5e55a0de00000001.jsonl`,
        `${SYNTHETIC_SESSION_ID}/subagents/agent-awhat-is-wc-5e55a0de00000001.meta.json`,
      ].sort(),
    )
    expect(strFromU8(files[`${SYNTHETIC_SESSION_ID}.jsonl`])).toBe(fixtures.main.text)
  })

  it('reads blobs inside the service', async () => {
    const svc = new TranscriptService(new MemoryStore())
    const res = await svc.ingestBlobs([{ name: fixtures.main.name, blob: new Blob([fixtures.main.text]) }])
    expect(res.added.map((s) => s.sessionId)).toEqual([SYNTHETIC_SESSION_ID])
  })
})

describe('exportBundle with hostile ids', () => {
  const line = (r: Record<string, unknown>) => JSON.stringify(r)
  const mainText = [
    line({
      type: 'user',
      uuid: 'u1',
      parentUuid: null,
      sessionId: '../../evil',
      timestamp: '2026-01-01T00:00:00.000Z',
      message: { role: 'user', content: 'hi' },
    }),
  ].join('\n')
  const agentText = [
    line({
      type: 'user',
      uuid: 'a1',
      parentUuid: null,
      isSidechain: true,
      agentId: '../x',
      sessionId: '../../evil',
      timestamp: '2026-01-01T00:00:01.000Z',
      message: { role: 'user', content: 'task' },
    }),
  ].join('\n')

  it('slugifies content-derived ids into safe keys and archive entries', async () => {
    const store = new MemoryStore()
    const svc = new TranscriptService(store)
    const res = await svc.ingest([
      { name: 'transcript.jsonl', text: mainText },
      { name: 'sub.jsonl', text: agentText },
    ])
    expect(res.errors).toEqual([])
    const sid = res.added[0].sessionId
    expect(sid).toBe('.._.._evil')
    const keys = (await store.getFilesForSession(sid)).map((f) => f.key).sort()
    expect(keys).toEqual(['.._.._evil', '.._.._evil/subagents/agent-.._x.jsonl'])
    for (const k of keys) expect(k.split('/')).not.toContain('..')

    const b = await svc.exportBundle(sid)
    expect(b.fileName).toBe('.._.._evil.zip')
    const names = Object.keys(unzipSync(b.data as Uint8Array))
    expect(names.sort()).toEqual(['.._.._evil.jsonl', '.._.._evil/subagents/agent-.._x.jsonl'])
    for (const n of names) {
      expect(n.startsWith('/')).toBe(false)
      expect(n.split('/').some((s) => s === '..' || s === '.' || s === '')).toBe(false)
    }
  })

  it('rejects ids that slugify to dots only', async () => {
    const svc = new TranscriptService(new MemoryStore())
    const res = await svc.ingest([{ name: '...jsonl', text: mainText.replace('../../evil', '..') }])
    expect(res.added).toEqual([])
    expect(res.errors[0]?.message).toMatch(/Invalid session id/)
  })
})
