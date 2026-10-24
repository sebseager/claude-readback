import type { SessionSummary, StoredFile } from '../transcript/types'
import { exportName, mainKey, metaKey, sortForExport, sortSummaries, subagentKey, workflowKey } from './keys'

const summary = (sessionId: string, startedAt: string) => ({ sessionId, startedAt }) as SessionSummary
const file = (key: string, role: StoredFile['role']) => ({ key, role, sessionId: 's' }) as StoredFile

describe('store keys', () => {
  it('builds keys following the on-disk layout', () => {
    expect(mainKey('s')).toBe('s')
    expect(subagentKey('s', 'a1')).toBe('s/subagents/agent-a1.jsonl')
    expect(metaKey('s', 'a1')).toBe('s/subagents/agent-a1.meta.json')
    expect(metaKey('', 'a1')).toBe('_unlinked/subagents/agent-a1.meta.json')
    expect(workflowKey('s', 'x/s/subagents/workflows/r1/journal.jsonl')).toBe(
      's/subagents/workflows/r1/journal.jsonl',
    )
    expect(workflowKey('s', 'r1.json')).toBe('s/workflows/r1.json')
  })

  it('names exports for re-import', () => {
    expect(exportName(file('s', 'main'))).toBe('s.jsonl')
    expect(exportName(file('s/subagents/agent-a.jsonl', 'subagent'))).toBe('s/subagents/agent-a.jsonl')
  })

  it('sorts sessions newest first, undated last', () => {
    const out = sortSummaries([
      summary('a', '2026-01-01T00:00:00Z'),
      summary('b', ''),
      summary('c', '2026-02-01T00:00:00Z'),
    ])
    expect(out.map((s) => s.sessionId)).toEqual(['c', 'a', 'b'])
  })

  it('exports the main file first', () => {
    const out = sortForExport([
      file('s/subagents/agent-b.jsonl', 'subagent'),
      file('s', 'main'),
      file('s/subagents/agent-a.meta.json', 'meta'),
    ])
    expect(out.map((f) => f.key)).toEqual(['s', 's/subagents/agent-a.meta.json', 's/subagents/agent-b.jsonl'])
  })
})

describe('key sanitising', () => {
  it('never produces traversal segments', () => {
    for (const k of [
      mainKey('../../evil'),
      subagentKey('../a', '../x'),
      metaKey('..', '/etc/passwd'),
      workflowKey('s', 's/../../../x.json'),
      exportName({ key: '../../a/./b', role: 'subagent', sessionId: 's' }),
    ]) {
      expect(k.split('/')).not.toContain('..')
      expect(k.startsWith('/')).toBe(false)
    }
  })
})
