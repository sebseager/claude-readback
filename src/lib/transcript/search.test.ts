import { fixtures } from '../../test/fixtures'
import { foldSession } from './fold'
import { parseJsonl } from './parse'
import { MAX_ENTRY_CHARS, buildSearchIndex, searchSession, stripBase64 } from './search'
import type { SearchEntry, Turn } from './types'

describe('search over the synthetic session', () => {
  const s = foldSession(parseJsonl(fixtures.main.text).records)
  const rowIds = new Set(s.turns.flatMap((t) => [t.id, ...t.items.map((i) => i.id)]))

  it('only points at real rows and blocks', () => {
    const blockIds = new Set(
      s.turns.flatMap((t) =>
        t.items.flatMap((i) => (i.kind === 'assistant' ? i.blocks.map((b) => b.id) : [])),
      ),
    )
    for (const e of s.searchIndex) {
      expect(rowIds.has(e.rowId), e.rowId).toBe(true)
      if (e.blockId && !/^(pasted|ctx|sr|mention):/.test(e.blockId))
        expect(blockIds.has(e.blockId), e.blockId).toBe(true)
    }
  })

  it('finds prompts by turn id', () => {
    const m = searchSession(s.searchIndex, 'WORD-COUNT command')
    expect(m[0]).toMatchObject({ rowId: '5e55a0de-9000-4000-8000-000000000002', field: 'prompt' })
    expect(m[0].snippet.match.toLowerCase()).toBe('word-count command')
  })

  it('finds pasted text with a pasted:<index> block id', () => {
    const m = searchSession(s.searchIndex, 'SPEC PLACEHOLDER LINE 3')
    expect(m.map((x) => [x.field, x.blockId])).toContainEqual(['pasted', 'pasted:1'])
  })

  it('finds assistant text, tool input and tool results by item id + block id', () => {
    const result = searchSession(s.searchIndex, '1 failed, 1 passed').find((x) => x.field === 'tool-result')
    expect(result).toMatchObject({
      rowId: 'msg_01SYNTH0000000000000012',
      blockId: 'toolu_01SYNTH00000000014',
    })
    const input = searchSession(s.searchIndex, 'example.com/docs').find((x) => x.field === 'tool-input')
    expect(input?.rowId).toBe('msg_01SYNTH0000000000000008')
    const assistant = searchSession(s.searchIndex, 'word-count').filter((x) => x.field === 'assistant')
    expect(assistant.length).toBeGreaterThan(0)
    for (const a of assistant) expect(a.rowId.startsWith('msg_')).toBe(true)
  })

  it('finds thinking text and event labels', () => {
    const thinking = s.searchIndex.find((e) => e.field === 'thinking')
    expect(thinking).toBeDefined()
    const word = thinking?.text.split(/\s+/).find((w) => w.length > 5) ?? ''
    expect(searchSession(s.searchIndex, word).some((m) => m.field === 'thinking')).toBe(true)
    const ev = searchSession(s.searchIndex, 'compacted while idle')[0]
    expect(ev.field).toBe('event')
    expect(ev.rowId.startsWith('ev-')).toBe(true)
  })

  it('indexes hidden context under the turn id', () => {
    const m = searchSession(s.searchIndex, 'Placeholder skill description').find((x) => x.field === 'context')
    expect(m?.rowId).toBe('5e55a0de-9000-4000-8000-000000000002')
    expect(m?.blockId).toMatch(/^ctx:/)
  })

  it('strips base64 from tool results', () => {
    expect(searchSession(s.searchIndex, 'iVBORw0KGgo')).toEqual([])
  })

  it('returns every occurrence with offsets', () => {
    const entries: SearchEntry[] = [{ rowId: 'r', field: 'assistant', text: 'abc ABC aBc' }]
    expect(searchSession(entries, 'abc').map((m) => [m.start, m.end])).toEqual([
      [0, 3],
      [4, 7],
      [8, 11],
    ])
    expect(searchSession(entries, 'abc', { limit: 2 })).toHaveLength(2)
    expect(searchSession(entries, '   ')).toEqual([])
  })

  it('handles case folding that changes string length', () => {
    const entries: SearchEntry[] = [{ rowId: 'r', field: 'assistant', text: 'İstanbul and istanbul' }]
    const m = searchSession(entries, 'istanbul')
    expect(m.length).toBeGreaterThanOrEqual(1)
    expect(entries[0].text.slice(m[m.length - 1].start, m[m.length - 1].end)).toBe('istanbul')
  })
})

describe('buildSearchIndex limits', () => {
  it('caps huge entries and is fast on a 25 MB session', () => {
    const big = 'needle '.repeat(100_000) // 700 KB
    const turns: Turn[] = Array.from({ length: 40 }, (_, i) => ({
      id: `t${i}`,
      kind: 'human',
      startedAt: '',
      hiddenContext: [],
      prompt: { segments: [{ kind: 'text', text: big }], mentions: [], rawText: big, recordUuid: '' },
      items: [],
    }))
    const index = buildSearchIndex(turns)
    for (const e of index) expect(e.text.length).toBeLessThanOrEqual(MAX_ENTRY_CHARS)
    const t0 = performance.now()
    const m = searchSession(index, 'zzz-not-there')
    const ms = performance.now() - t0
    expect(m).toEqual([])
    expect(ms).toBeLessThan(300)
  })

  it('strips long base64 runs only', () => {
    expect(stripBase64('short')).toBe('short')
    expect(stripBase64(`x ${'A'.repeat(300)} y`)).toBe('x [base64] y')
  })
})
