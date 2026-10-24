import { FORK_ID, SUBAGENT_ID, SYNTHETIC_SESSION_ID, fixtures } from '../test/fixtures'
import { computeStats, computeTurnGaps, quantile } from './stats'
import {
  foldSession,
  parseJsonl,
  type AssistantItem,
  type Session,
  type SubagentFileInfo,
} from './transcript'

// Every expected number below is hand-computed from fixtures/synthetic-session*.jsonl (see fixtures/README.md).
const subagentFiles = (): SubagentFileInfo[] => [
  {
    agentId: SUBAGENT_ID,
    fileKey: `${SYNTHETIC_SESSION_ID}/subagents/agent-${SUBAGENT_ID}.jsonl`,
    meta: JSON.parse(fixtures.agentMeta.text) as Record<string, unknown>,
  },
  {
    agentId: FORK_ID,
    fileKey: `${SYNTHETIC_SESSION_ID}/subagents/agent-${FORK_ID}.jsonl`,
    meta: JSON.parse(fixtures.forkMeta.text) as Record<string, unknown>,
    forkParentLastUuid: '00000000-0000-4000-8000-000000000077',
  },
]

const foldMain = (dropCostState = false) => {
  const records = parseJsonl(fixtures.main.text).records.filter(
    (r) => !dropCostState || r.type !== 'cost-state',
  )
  return foldSession(records, { subagentFiles: subagentFiles() })
}
const foldAgent = (text: string, agentId: string) => foldSession(parseJsonl(text).records, { agentId })
const subagents = () => [foldAgent(fixtures.agent.text, SUBAGENT_ID), foldAgent(fixtures.fork.text, FORK_ID)]

// claude-opus-5-5: $4 in / $20 out / $0.20 cache read / $8 1h cache write per MTok. Every fixture cache write is 1h.
const opusUsd = (input: number, read: number, write1h: number, output: number) =>
  (input * 4 + read * 0.2 + write1h * 8 + output * 20) / 1e6

describe('computeStats on the synthetic fixture', () => {
  const session = foldMain()
  const s = computeStats(session)

  it('counts totals', () => {
    expect(s.totals).toEqual({
      turns: 7, // human prompts (slash commands, notifications, hand-backs, compact summary excluded)
      assistantMessages: 21, // msg_…01 … msg_…21; the <synthetic> 529 error sits on the abandoned branch
      toolCalls: 17,
      toolErrors: 2, // failing Bash (line 66) + rejected tool use (line 86)
      subagents: 2, // background Agent + /btw fork
      subagentsUploaded: 2,
      wallMs: 65_800, // 09:00:00.400 → 09:01:06.200
      activeMs: 87_750, // 41250 + 28800 + 6100 + 2500 + 9100
      thinkingMs: 5_060, // 2310 + 1450 + 900 + 400
      interrupts: 2, // lines 87 (tool use) and 90 (user)
      compactions: 1,
    })
    expect(s.startedAt).toBe('2026-10-20T09:00:00.400Z')
    expect(s.endedAt).toBe('2026-10-20T09:01:06.200Z')
  })

  it('sums tokens over the 21 groups', () => {
    // Every group: 3 input, 18000 cache read, 1200 cache write; output from the record with stop_reason.
    expect(s.tokens).toEqual({
      inputTokens: 63,
      cacheReadTokens: 378_000,
      cacheWriteTokens: 25_200,
      outputTokens: 1_693,
      final: false, // msg_…18 was aborted mid-stream
    })
    expect(s.cacheHitRate).toBeCloseTo(378_000 / (63 + 378_000 + 25_200), 10)
  })

  it('prefers cost-state, with its per-model split', () => {
    expect(s.cost.source).toBe('cost-state')
    expect(s.cost.totalUsd).toBe(0.4213)
    expect(s.cost.byModel).toEqual([
      { model: 'claude-opus-5-5', usd: 0.4201, source: 'cost-state' },
      { model: 'claude-haiku-5-5', usd: 0.0012, source: 'cost-state' },
    ])
    expect(s.cost.coversSubagents).toBe(true)
    expect(s.cost.unpricedModels).toEqual([])
  })

  it('lists models', () => {
    expect(s.models).toEqual([
      {
        model: 'claude-opus-5-5',
        messages: 21,
        tokens: s.tokens,
        costUsd: 0.4201,
        costSource: 'cost-state',
      },
    ])
  })

  it('counts tools by name, sorted by count', () => {
    expect(s.tools.slice(0, 2)).toEqual([
      { name: 'Bash', count: 4, errors: 2, totalMs: 2_700 },
      { name: 'Read', count: 3, errors: 0, totalMs: 2_000 },
    ])
    expect(s.tools.map((t) => t.name).slice(2)).toEqual([
      'Agent',
      'AskUserQuestion',
      'Edit',
      'Glob',
      'Grep',
      'Skill',
      'ToolSearch',
      'WebFetch',
      'WebSearch',
      'Write',
    ])
    expect(s.tools.reduce((n, t) => n + t.count, 0)).toBe(17)
    // Grep: tool_use 09:00:15.400 → result 09:00:16.900
    expect(s.tools.find((t) => t.name === 'Grep')?.totalMs).toBe(1_500)
  })

  it('builds the context series and marks the compaction', () => {
    expect(s.contextSeries).toHaveLength(21)
    expect(s.contextSeries.every((p) => p.contextTokens === 3 + 18_000 + 1_200)).toBe(true)
    expect(s.contextSeries[0]).toEqual({
      index: 1,
      at: '2026-10-20T09:00:08.700Z',
      contextTokens: 19_203,
      output: 512,
      model: 'claude-opus-5-5',
      turnIndex: 3, // after the meta (hooks) turn and the /model, /effort commands
      messageId: 'msg_01SYNTH0000000000000001',
    })
    expect(s.contextSeries[20].messageId).toBe('msg_01SYNTH0000000000000021')
    // compact_boundary sits between msg_…19 and msg_…20
    expect(s.compactionMarks).toEqual([
      { index: 20, at: '2026-10-20T09:00:58.500Z', preTokens: 151_000, trigger: 'auto', source: 'boundary' },
    ])
  })

  it('measures the gaps before user-started turns', () => {
    const g = s.turnGaps!
    expect(g.gaps.map((x) => [x.turnIndex, x.ms])).toEqual([
      [1, 1_200], // /model at 02.000, hooks ended 00.800
      [2, 400], // /effort at 02.800, /model stdout at 02.400
      [3, 800], // prompt at 04.000, /effort local_command reply at 03.200
      [4, 400],
      [5, 400],
      [8, 400], // /btw after the agent hand-back turn
      [9, 400],
      [10, 400],
      [11, 2_000], // the rewound prompt: 52.700 → 54.700
      [13, 400], // after the compact summary's attachments (59.700)
    ])
    expect(g.count).toBe(10)
    expect(g.medianMs).toBe(400)
    expect(g.p90Ms).toBeCloseTo(1_280, 6) // sorted[8] + 0.1 * (sorted[9] - sorted[8]) = 1200 + 80
    expect(g.maxMs).toBe(2_000)
    expect(g.longest).toEqual({ ms: 2_000, turnIndex: 11, turnId: session.turns[11].id })
  })
})

describe('computeStats cost estimates', () => {
  const mainEstimate = 21 * opusUsd(3, 18_000, 1_200, 0) + opusUsd(0, 0, 0, 1_693)

  it('estimates per group (1h cache writes) when cost-state is missing', () => {
    const s = computeStats(foldMain(true))
    expect(s.cost.source).toBe('estimate')
    expect(s.cost.totalUsd).toBeCloseTo(mainEstimate, 10) // $0.311312
    expect(s.cost.byModel).toHaveLength(1)
    expect(s.cost.byModel[0].usd).toBeCloseTo(mainEstimate, 10)
    expect(s.models[0].costSource).toBe('estimate')
    expect(s.cost.coversSubagents).toBe(false)
  })

  it('adds subagent usage to tokens, tools and the estimate', () => {
    const s = computeStats(foldMain(true), { includeSubagents: subagents() })
    expect(s.includedSubagents).toBe(2)
    expect(s.tokens).toEqual({
      inputTokens: 63 + 6 + 3,
      cacheReadTokens: 378_000 + 18_000 + 5_000,
      cacheWriteTokens: 25_200 + 1_600 + 100,
      outputTokens: 1_693 + 100 + 25,
      final: false,
    })
    const agentUsd = opusUsd(6, 18_000, 1_600, 100) // 0.018424
    const forkUsd = opusUsd(3, 5_000, 100, 25) // 0.002312
    expect(s.cost.totalUsd).toBeCloseTo(mainEstimate + agentUsd + forkUsd, 10)
    expect(s.cost.coversSubagents).toBe(true)
    expect(s.tools.find((t) => t.name === 'Bash')?.count).toBe(5)
    expect(s.tools.find((t) => t.name === 'SubagentHandback')?.count).toBe(1)
    expect(s.models[0].messages).toBe(21 + 2 + 1) // the fork's <synthetic> message is skipped
    // Totals and the context line stay main-session only.
    expect(s.totals.toolCalls).toBe(17)
    expect(s.contextSeries).toHaveLength(21)
  })

  it('keeps the cost-state total when including subagents (it already covers them)', () => {
    const s = computeStats(foldMain(), { includeSubagents: subagents() })
    expect(s.cost.totalUsd).toBe(0.4213)
    expect(s.tokens.outputTokens).toBe(1_818)
  })
})

describe('compaction drops and helpers', () => {
  it('infers a compaction from a sharp context drop', () => {
    const session = structuredClone(foldMain()) as Session
    let n = 0
    for (const t of session.turns)
      for (const i of t.items)
        if (i.kind === 'assistant' && ++n <= 10) (i as AssistantItem).usage.cacheReadTokens = 200_000
    const s = computeStats(session)
    expect(s.compactionMarks[0]).toMatchObject({ index: 11, preTokens: 201_203, source: 'drop' })
    expect(s.compactionMarks[1]).toMatchObject({ index: 20, source: 'boundary' })
  })

  it('quantile interpolates linearly', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5)
    expect(quantile([5], 0.9)).toBe(5)
    expect(Number.isNaN(quantile([], 0.5))).toBe(true)
  })

  it('has no gaps for a single turn', () => {
    expect(computeTurnGaps(foldMain().turns.slice(0, 1))).toBeUndefined()
  })
})
