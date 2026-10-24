import { fixtures } from '../../test/fixtures'
import { METADATA_TYPES, placedLines } from '../../test/placement'
import { foldSession } from './fold'
import { parseJsonl } from './parse'
import type { AssistantItem, ToolBlock } from './types'

const u = (n: number) => `ed9e0000-0000-4000-9000-${String(n).padStart(12, '0')}`

describe('fixtures/edge-cases.jsonl', () => {
  const parsed = parseJsonl(fixtures.edge.text)
  const s = foldSession(parsed.records)
  const assistants = s.turns.flatMap((t) => t.items.filter((i): i is AssistantItem => i.kind === 'assistant'))
  const tools = assistants.flatMap((a) => a.blocks.filter((b): b is ToolBlock => b.kind === 'tool'))
  const tool = (id: string) => tools.find((b) => b.id === id)
  const turn = (id: string) => s.turns.find((t) => t.id === id)

  it('skips blank and invalid lines, reporting the invalid ones and the partial last line', () => {
    expect(parsed.errors.map((e) => e.line)).toEqual([2, 37])
    expect(parsed.errors[1].message).toMatch(/^Partial last line/)
    expect(parsed.records.some((r) => r.line === 1)).toBe(false)
  })

  it('places every non-metadata record except uuid duplicates', () => {
    const placed = placedLines(s)
    const seen = new Set<string>()
    const dupes = parsed.records.filter(
      (r) => typeof r.uuid === 'string' && (seen.has(r.uuid) || !seen.add(r.uuid)),
    )
    expect(dupes.map((r) => r.line)).toEqual([25])
    const missing = parsed.records.filter(
      (r) => !placed.has(r.line) && !METADATA_TYPES.has(r.type) && !dupes.includes(r),
    )
    expect(missing.map((r) => `${r.line}:${r.type}`)).toEqual([])
  })

  it('numbers two pastes in one prompt and tolerates a plain closing tag', () => {
    const segs = turn('ed9e-p1')?.prompt?.segments ?? []
    expect(segs.map((x) => x.kind)).toEqual(['text', 'pasted', 'text', 'pasted', 'system-reminder'])
    expect(segs.filter((x) => x.kind === 'pasted')).toEqual([
      { kind: 'pasted', id: 'b0b0', index: 1, lines: 1, text: 'alpha one\nalpha two' },
      { kind: 'pasted', id: 'c1c1', index: 2, lines: 2, text: 'beta one\nbeta two\nbeta three' },
    ])
    expect(segs[4]).toEqual({ kind: 'system-reminder', text: 'inline reminder text' })
  })

  it('continues the paste numbering in queued messages', () => {
    const q = turn('ed9e-pC')?.items.find((i) => i.kind === 'queued-user')
    expect(q?.kind === 'queued-user' && q.segments?.find((x) => x.kind === 'pasted')).toMatchObject({
      index: 3,
      lines: 1,
    })
  })

  it('groups a parallel tool call message and pairs out-of-order results', () => {
    const par = assistants.find((a) => a.id === 'msg_par')
    expect(par?.blocks.map((b) => b.id)).toEqual(['toolu_par_a', 'toolu_par_b', 'toolu_par_c'])
    expect(par?.usage).toMatchObject({ outputTokens: 77, final: true })
    expect(tool('toolu_par_a')?.result?.content).toEqual([{ type: 'text', text: 'contents of a' }])
    expect(tool('toolu_par_b')?.result?.content).toEqual([{ type: 'text', text: 'src/x.ts:1:needle' }])
    expect(tool('toolu_par_c')?.result?.isError).toBe(false)
    expect(tool('toolu_par_b')?.summary).toBe('needle in src')
  })

  it('handles the linear 2.1.235 shape, redacted thinking and unknown blocks', () => {
    const lin = assistants.find((a) => a.id === 'msg_lin')
    expect(lin?.blocks.map((b) => b.kind)).toEqual(['thinking', 'unknown', 'text'])
    expect(lin?.blocks[0]).toMatchObject({ kind: 'thinking', redacted: true, text: '' })
    expect(lin?.usage.final).toBe(true)
  })

  it('falls back to sourceToolAssistantUUID and hides orphan results', () => {
    expect(tool('toolu_src')?.result?.content).toEqual([{ type: 'text', text: 'a b c' }])
    const hidden = turn('ed9e-p1')?.hiddenContext.map((h) => h.label)
    expect(hidden).toContain('Tool result without a matching call (toolu_missing)')
    expect(hidden).toContain('Mystery attachment')
  })

  it('renders unknown record types and system subtypes as events', () => {
    const labels = turn('ed9e-p1')?.items.flatMap((i) =>
      i.kind === 'event' ? [`${i.category}:${i.level}:${i.label}`] : [],
    )
    expect(labels).toEqual([
      'other:warning:brand_new_subtype: something new',
      'other:info:Unknown record: mystery',
    ])
  })

  it('takes the branch that ends at the last uuid record and keeps the rewound one', () => {
    expect(s.turns.map((t) => t.id)).toEqual([
      'ed9e-p1',
      'ed9e-pB',
      'ed9e-pM',
      'ed9e-pBash',
      'ed9e-pC',
      u(41),
    ])
    expect(s.abandoned).toHaveLength(1)
    const a = s.abandoned[0]
    expect(a.records.map((r) => r.uuid)).toEqual([u(20), u(21), u(22), u(23)])
    expect(a.forkAfterUuid).toBe(u(16))
    expect(a.replacedByTurnId).toBe('ed9e-pB')
    expect(a.turns?.map((t) => t.kind)).toEqual(['human', 'human'])
    expect(a.firstPromptPreview).toBe('Prompt A (will be abandoned)')
  })

  it('keeps the first of two records with the same uuid', () => {
    expect(JSON.stringify(s.turns)).not.toContain('DUPLICATE SHOULD NOT RENDER')
    expect(assistants.some((a) => a.id === 'msg_B')).toBe(true)
  })

  it('opens a meta turn for an isMeta prompt with a new promptId; missing usage is non-final', () => {
    const t = turn('ed9e-pM')
    expect(t?.kind).toBe('meta')
    const a = t?.items[0]
    expect(a?.kind === 'assistant' && a.usage).toMatchObject({ outputTokens: 0, final: false })
  })

  it('treats ! bash mode as a command with output', () => {
    expect(turn('ed9e-pBash')?.prompt?.command).toEqual({
      name: '!',
      args: 'git status',
      stdout: 'On branch feature/x',
    })
  })

  it('accepts Task as an alias of Agent with a synchronous completed result', () => {
    expect(tool('toolu_task')?.subagent).toMatchObject({
      agentId: 'alegacy0001',
      status: 'completed',
      handback: 'Legacy report.',
      agentType: 'Explore',
      description: 'Legacy task',
    })
  })

  it('marks a shutdown interrupt and opens a compact-summary turn without a boundary', () => {
    expect(turn('ed9e-pC')?.interrupted).toBe('shutdown')
    const last = s.turns[s.turns.length - 1]
    expect(last.kind).toBe('compact-summary')
    expect(last.items).toEqual([])
  })

  it('falls back to the first prompt for the title', () => {
    expect(s.summary.titleSource).toBe('first-prompt')
    expect(s.summary.title).toBe('Compare these two logs. [Pasted text] and [Pasted text]')
    expect(s.summary.costSource).toBe('estimate')
    expect(s.summary.lastPrompt).toBe('Prompt C')
  })
})

describe('title fallbacks for sessions without a typed prompt', () => {
  const sid = 'f0f0f0f0-0000-4000-8000-000000000001'
  const base = (n: number, extra: Record<string, unknown>) =>
    JSON.stringify({
      uuid: `f0f0f0f0-0000-4000-8000-${String(n).padStart(12, '0')}`,
      parentUuid: n > 1 ? `f0f0f0f0-0000-4000-8000-${String(n - 1).padStart(12, '0')}` : null,
      sessionId: sid,
      timestamp: `2026-01-01T00:00:0${n}.000Z`,
      ...extra,
    })
  const fold = (lines: string[]) => foldSession(parseJsonl(lines.join('\n')).records).summary

  it('uses the first slash command', () => {
    const s = fold([
      base(1, {
        type: 'system',
        subtype: 'local_command',
        content: '<command-name>/model</command-name>\n<command-args>opus</command-args>',
      }),
      JSON.stringify({ type: 'last-prompt', lastPrompt: 'something typed', sessionId: sid }),
    ])
    expect(s).toMatchObject({ title: '/model opus', titleSource: 'command' })
  })

  it('falls back to the last-prompt record before the session id', () => {
    const s = fold([
      base(1, { type: 'system', subtype: 'informational', content: 'hello' }),
      JSON.stringify({ type: 'last-prompt', lastPrompt: 'fix the flaky test', sessionId: sid }),
    ])
    expect(s).toMatchObject({ title: 'fix the flaky test', titleSource: 'last-prompt' })
  })

  it('uses the session id only when nothing else is there', () => {
    const s = fold([base(1, { type: 'system', subtype: 'informational', content: 'hello' })])
    expect(s).toMatchObject({ title: sid, titleSource: 'session-id' })
  })
})

describe('non-monotonic timestamps', () => {
  const sid = 'f1f1f1f1-0000-4000-8000-000000000001'
  const id = (n: number) => `f1f1f1f1-0000-4000-8000-${String(n).padStart(12, '0')}`
  const rec = (n: number, ts: string, extra: Record<string, unknown>) =>
    JSON.stringify({
      uuid: id(n),
      parentUuid: n > 1 ? id(n - 1) : null,
      sessionId: sid,
      timestamp: ts,
      ...extra,
    })

  it('never yields negative durations', () => {
    const s = foldSession(
      parseJsonl(
        [
          rec(1, '2026-01-01T00:00:10.000Z', { type: 'user', message: { role: 'user', content: 'go' } }),
          rec(2, '2026-01-01T00:00:05.000Z', {
            type: 'assistant',
            thinkingDurationMs: -40,
            message: {
              id: 'm1',
              role: 'assistant',
              model: 'claude-opus-5-5',
              content: [
                { type: 'thinking', thinking: '' },
                { type: 'text', text: 'ok' },
              ],
              stop_reason: 'end_turn',
              usage: { input_tokens: 1, output_tokens: 1 },
            },
          }),
          rec(3, '2026-01-01T00:00:01.000Z', { type: 'system', subtype: 'turn_duration', durationMs: -900 }),
        ].join('\n'),
      ).records,
    )
    expect(s.summary.durationMs).toBeGreaterThanOrEqual(0)
    for (const t of s.turns) expect(t.durationMs ?? 0).toBeGreaterThanOrEqual(0)
    const thinking = s.turns
      .flatMap((t) => t.items)
      .flatMap((i) => (i.kind === 'assistant' ? i.blocks : []))
      .find((b) => b.kind === 'thinking')
    expect(thinking && thinking.kind === 'thinking' ? thinking.durationMs : -1).toBe(0)
  })
})
