import { FORK_ID, SUBAGENT_ID, SYNTHETIC_SESSION_ID, fixtures } from '../../test/fixtures'
import { classifyFile, forkParentOf } from './subagents'

describe('classifyFile', () => {
  it('classifies the main transcript by its records', () => {
    expect(classifyFile(fixtures.main.name, fixtures.main.text)).toEqual({
      role: 'main',
      sessionId: SYNTHETIC_SESSION_ID,
    })
  })

  it('prefers a uuid file name for main transcripts', () => {
    const id = '11111111-2222-4333-8444-555555555555'
    expect(classifyFile(`${id}.jsonl`, fixtures.main.text)).toEqual({ role: 'main', sessionId: id })
  })

  it('classifies subagent transcripts with the parent session id from their records', () => {
    expect(classifyFile(`agent-${SUBAGENT_ID}.jsonl`, fixtures.agent.text)).toMatchObject({
      role: 'subagent',
      agentId: SUBAGENT_ID,
      sessionId: SYNTHETIC_SESSION_ID,
    })
  })

  it('reads fork-context-ref for forks', () => {
    expect(classifyFile(`agent-${FORK_ID}.jsonl`, fixtures.fork.text)).toMatchObject({
      role: 'subagent',
      agentId: FORK_ID,
      sessionId: SYNTHETIC_SESSION_ID,
      forkParentLastUuid: '00000000-0000-4000-8000-000000000077',
    })
    expect(forkParentOf(fixtures.fork.text)).toBe('00000000-0000-4000-8000-000000000077')
    expect(forkParentOf(fixtures.agent.text)).toBeUndefined()
  })

  it('classifies a renamed subagent file by its sidechain records', () => {
    expect(classifyFile('whatever.jsonl', fixtures.agent.text)).toMatchObject({
      role: 'subagent',
      agentId: SUBAGENT_ID,
    })
  })

  it('classifies meta files, taking the session from a relative path when present', () => {
    expect(classifyFile(`agent-${SUBAGENT_ID}.meta.json`, fixtures.agentMeta.text)).toMatchObject({
      role: 'meta',
      agentId: SUBAGENT_ID,
      sessionId: undefined,
      meta: { toolUseId: 'toolu_01SYNTH00000000015' },
    })
    expect(
      classifyFile(`abc/subagents/agent-${SUBAGENT_ID}.meta.json`, fixtures.agentMeta.text).sessionId,
    ).toBe('abc')
  })

  it('rejects junk', () => {
    expect(classifyFile('notes.txt', 'hello').role).toBe('unknown')
    expect(classifyFile('x.json', '{"a":1}').role).toBe('unknown')
    expect(classifyFile(`agent-x.meta.json`, '{bad').role).toBe('unknown')
    expect(classifyFile('sid/subagents/workflows/r1/journal.jsonl', '{"type":"launched"}')).toEqual({
      role: 'workflow',
      sessionId: 'sid',
    })
  })
})
