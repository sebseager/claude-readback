// Session statistics for the right-hand stats panel. Pure: (Session, subagent Sessions) → numbers.
import { estimateCostUsd, priceFor } from './pricing'
import { recordByLine } from './transcript/parse'
import type { AssistantItem, RawRecord, Session, ToolBlock, Turn, TurnKind, Usage } from './transcript/types'

export interface StatsTotals {
  /** Human prompts (turn kind 'human'), like `SessionSummary.turnCount`. */
  turns: number
  /** Assistant API messages (groups) on the active branch. */
  assistantMessages: number
  toolCalls: number
  toolErrors: number
  /** Subagents referenced by the session / how many of them have an uploaded transcript. */
  subagents: number
  subagentsUploaded: number
  /** First to last timestamp in the file. */
  wallMs: number
  /** Sum of `turn_duration` (Claude working), when the file has any. */
  activeMs?: number
  /** Sum of thinking block durations. */
  thinkingMs: number
  interrupts: number
  compactions: number
}

export interface ToolStat {
  name: string
  count: number
  errors: number
  /** Sum of tool_use → tool_result time over calls that have both timestamps. */
  totalMs?: number
}

export interface ModelStat {
  model: string
  messages: number
  tokens: Usage
  costUsd?: number
  costSource?: 'cost-state' | 'estimate'
}

export interface CostStats {
  totalUsd?: number
  source?: 'cost-state' | 'estimate'
  byModel: { model: string; usd?: number; source: 'cost-state' | 'estimate' }[]
  /** Models with usage but no entry in the pricing table (their cost is missing from estimates). */
  unpricedModels: string[]
  /** True when subagent usage is part of `totalUsd` (always for cost-state, which covers them already). */
  coversSubagents: boolean
}

export interface ContextPoint {
  /** 1-based position among the plotted API messages. */
  index: number
  at: string
  /** Prompt size the model saw: input + cache read + cache write. */
  contextTokens: number
  output: number
  model: string
  /** Index into `session.turns`. */
  turnIndex: number
  messageId: string
}

export interface CompactionMark {
  /** `ContextPoint.index` of the first message after the compaction (undefined when none followed). */
  index?: number
  at?: string
  preTokens?: number
  trigger?: string
  /** 'boundary' = a compact_boundary record; 'drop' = inferred from a sharp context drop. */
  source: 'boundary' | 'drop'
}

export interface TurnGap {
  ms: number
  /** Index into `session.turns` of the turn the user started after the gap. */
  turnIndex: number
  turnId: string
}

export interface TurnGapStats {
  count: number
  medianMs: number
  p90Ms: number
  maxMs: number
  longest: TurnGap
  gaps: TurnGap[]
}

export interface SessionStats {
  totals: StatsTotals
  /** Over the main session, plus subagents when included. */
  tokens: Usage
  cost: CostStats
  tools: ToolStat[]
  models: ModelStat[]
  /** Main session only. */
  contextSeries: ContextPoint[]
  compactionMarks: CompactionMark[]
  turnGaps?: TurnGapStats
  /** cacheRead / (input + cacheRead + cacheWrite); undefined when there was no prompt traffic. */
  cacheHitRate?: number
  startedAt?: string
  endedAt?: string
  /** Number of subagent sessions folded into tokens / cost / tools / models. */
  includedSubagents: number
}

export interface ComputeStatsOptions {
  includeSubagents?: readonly Session[]
}

const SYNTHETIC = '<synthetic>'
/** Turn kinds a person starts; the gap before them is "user think time". */
const USER_STARTED: ReadonlySet<TurnKind> = new Set<TurnKind>(['human', 'slash-command'])
/** A context drop below this fraction of the previous message, with no boundary in between, counts as a compaction. */
const DROP_RATIO = 0.5
const DROP_MIN_TOKENS = 20_000

const emptyUsage = (): Usage => ({
  inputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  outputTokens: 0,
  final: true,
})

function addUsage(into: Usage, u: Usage) {
  into.inputTokens += u.inputTokens
  into.cacheReadTokens += u.cacheReadTokens
  into.cacheWriteTokens += u.cacheWriteTokens
  into.outputTokens += u.outputTokens
  if (!u.final) into.final = false
}

const promptTokens = (u: Usage) => u.inputTokens + u.cacheReadTokens + u.cacheWriteTokens

const ms = (iso?: string): number | undefined => {
  if (!iso) return undefined
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : undefined
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const numOr = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined

/** 1-hour cache-write tokens of a group, read from the record that carried its final usage. */
function cacheWrite1h(raw: readonly RawRecord[], item: AssistantItem): number {
  let fallback: RawRecord | undefined
  for (let i = item.recordLines.length - 1; i >= 0; i--) {
    const r = recordByLine(raw, item.recordLines[i])
    if (!r || r.type !== 'assistant') continue
    fallback ??= r
    const m = r.message
    if (isObj(m) && m.stop_reason !== null && m.stop_reason !== undefined) {
      fallback = r
      break
    }
  }
  const m = fallback?.message
  const u = isObj(m) ? m.usage : undefined
  const cc = isObj(u) ? u.cache_creation : undefined
  return (isObj(cc) ? numOr(cc.ephemeral_1h_input_tokens) : undefined) ?? 0
}

function lastCostState(raw: readonly RawRecord[]): RawRecord | undefined {
  for (let i = raw.length - 1; i >= 0; i--) if (raw[i].type === 'cost-state') return raw[i]
  return undefined
}

/** Linear-interpolated quantile (R type 7) of an ascending array. */
export function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return NaN
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

/** Latest timestamp seen inside a turn (its own records, hidden context, items, tool results). */
function turnEndMs(t: Turn, raw: readonly RawRecord[]): number | undefined {
  let end = ms(t.startedAt)
  const bump = (iso?: string) => {
    const v = ms(iso)
    if (v !== undefined && (end === undefined || v > end)) end = v
  }
  const bumpLine = (line: number) => {
    const ts = recordByLine(raw, line)?.timestamp
    if (typeof ts === 'string') bump(ts)
  }
  for (const l of t.recordLines ?? []) bumpLine(l)
  for (const h of t.hiddenContext) bumpLine(h.recordLine)
  for (const item of t.items) {
    switch (item.kind) {
      case 'assistant':
        bump(item.endedAt)
        for (const b of item.blocks) if (b.kind === 'tool') bump(b.endedAt)
        break
      case 'event':
        bump(item.at)
        break
      case 'compaction':
      case 'queued-user':
        bump(item.at)
        break
    }
  }
  return end
}

/** Gaps between the end of one turn and the start of the next user-started turn (think time). */
export function computeTurnGaps(
  turns: readonly Turn[],
  raw: readonly RawRecord[] = [],
): TurnGapStats | undefined {
  const gaps: TurnGap[] = []
  for (let i = 1; i < turns.length; i++) {
    const t = turns[i]
    if (!USER_STARTED.has(t.kind)) continue
    const prevEnd = turnEndMs(turns[i - 1], raw)
    const start = ms(t.startedAt)
    if (prevEnd === undefined || start === undefined || start < prevEnd) continue
    gaps.push({ ms: start - prevEnd, turnIndex: i, turnId: t.id })
  }
  if (gaps.length === 0) return undefined
  const sorted = gaps.map((g) => g.ms).sort((a, b) => a - b)
  let longest = gaps[0]
  for (const g of gaps) if (g.ms > longest.ms) longest = g
  return {
    count: gaps.length,
    medianMs: quantile(sorted, 0.5),
    p90Ms: quantile(sorted, 0.9),
    maxMs: sorted[sorted.length - 1],
    longest,
    gaps,
  }
}

interface ModelAcc {
  messages: number
  tokens: Usage
  estimate: number
  priced: boolean
}

interface UsageAcc {
  tokens: Usage
  models: Map<string, ModelAcc>
  tools: Map<string, ToolStat>
  estimate: number
  priced: boolean
}

function accumulate(session: Session, acc: UsageAcc) {
  for (const t of session.turns) {
    for (const item of t.items) {
      if (item.kind !== 'assistant') continue
      for (const b of item.blocks) if (b.kind === 'tool') addTool(acc.tools, b)
      if (item.model === SYNTHETIC) continue
      addUsage(acc.tokens, item.usage)
      const model = item.model || 'unknown'
      let m = acc.models.get(model)
      if (!m) {
        m = { messages: 0, tokens: emptyUsage(), estimate: 0, priced: false }
        acc.models.set(model, m)
      }
      m.messages++
      addUsage(m.tokens, item.usage)
      const c = estimateCostUsd(model, { ...item.usage, cacheWrite1hTokens: cacheWrite1h(session.raw, item) })
      if (c !== undefined) {
        m.estimate += c
        m.priced = true
        acc.estimate += c
        acc.priced = true
      }
    }
  }
}

function addTool(tools: Map<string, ToolStat>, b: ToolBlock) {
  let s = tools.get(b.name)
  if (!s) {
    s = { name: b.name, count: 0, errors: 0 }
    tools.set(b.name, s)
  }
  s.count++
  if (b.result?.isError) s.errors++
  const a = ms(b.startedAt)
  const z = ms(b.endedAt)
  if (a !== undefined && z !== undefined && z >= a) s.totalMs = (s.totalMs ?? 0) + (z - a)
}

export function computeStats(session: Session, opts: ComputeStatsOptions = {}): SessionStats {
  const { summary } = session
  const subs = opts.includeSubagents ?? []

  // Totals, context series and compactions: main session only.
  let assistantMessages = 0
  let toolCalls = 0
  let toolErrors = 0
  let thinkingMs = 0
  let interrupts = 0
  let compactions = 0
  const contextSeries: ContextPoint[] = []
  const compactionMarks: CompactionMark[] = []
  let pendingBoundary: CompactionMark | undefined

  session.turns.forEach((t, turnIndex) => {
    for (const item of t.items) {
      if (item.kind === 'event') {
        if (item.category === 'interrupt') interrupts++
        continue
      }
      if (item.kind === 'compaction') {
        compactions++
        const mark: CompactionMark = { at: item.at, source: 'boundary' }
        if (item.preTokens !== undefined) mark.preTokens = item.preTokens
        if (item.trigger) mark.trigger = item.trigger
        compactionMarks.push(mark)
        pendingBoundary = mark
        continue
      }
      if (item.kind !== 'assistant') continue
      assistantMessages++
      for (const b of item.blocks) {
        if (b.kind === 'tool') {
          toolCalls++
          if (b.result?.isError) toolErrors++
        } else if (b.kind === 'thinking' && b.durationMs) thinkingMs += b.durationMs
      }
      const context = promptTokens(item.usage)
      if (item.model === SYNTHETIC || context === 0) continue
      const point: ContextPoint = {
        index: contextSeries.length + 1,
        at: item.startedAt,
        contextTokens: context,
        output: item.usage.outputTokens,
        model: item.model,
        turnIndex,
        messageId: item.id,
      }
      const prev = contextSeries[contextSeries.length - 1]
      if (pendingBoundary) {
        pendingBoundary.index = point.index
        pendingBoundary = undefined
      } else if (
        prev &&
        prev.contextTokens - context >= DROP_MIN_TOKENS &&
        context < prev.contextTokens * DROP_RATIO
      ) {
        compactionMarks.push({
          index: point.index,
          at: point.at,
          preTokens: prev.contextTokens,
          source: 'drop',
        })
      }
      contextSeries.push(point)
    }
  })

  // Tokens / models / tools / estimates: main + included subagents.
  const acc: UsageAcc = {
    tokens: emptyUsage(),
    models: new Map(),
    tools: new Map(),
    estimate: 0,
    priced: false,
  }
  accumulate(session, acc)
  const mainEstimate = acc.priced ? acc.estimate : undefined
  for (const s of subs) accumulate(s, acc)

  // Cost: Claude Code's own cost-state wins (it already covers subagents and side queries).
  const costState = summary.costSource === 'cost-state' ? lastCostState(session.raw) : undefined
  const stateByModel = new Map<string, number>()
  const mu = costState?.modelUsage
  if (isObj(mu)) {
    for (const [model, v] of Object.entries(mu)) {
      const usd = isObj(v) ? numOr(v.costUSD) : undefined
      if (usd !== undefined) stateByModel.set(model, usd)
    }
  }

  const models: ModelStat[] = [...acc.models.entries()]
    .map(([model, m]) => {
      const row: ModelStat = { model, messages: m.messages, tokens: m.tokens }
      const state = stateByModel.get(model)
      if (state !== undefined) {
        row.costUsd = state
        row.costSource = 'cost-state'
      } else if (m.priced) {
        row.costUsd = m.estimate
        row.costSource = 'estimate'
      }
      return row
    })
    .sort((a, b) => b.messages - a.messages || a.model.localeCompare(b.model))

  let cost: CostStats
  const unpricedModels = models.filter((m) => !priceFor(m.model)).map((m) => m.model)
  if (summary.costSource === 'cost-state' && summary.costUsd !== undefined) {
    const byModel: CostStats['byModel'] = [...stateByModel.entries()].map(([model, usd]) => ({
      model,
      usd,
      source: 'cost-state' as const,
    }))
    // Models seen in the transcript but missing from cost-state (rare) get an estimate row.
    for (const m of models)
      if (!stateByModel.has(m.model) && m.costUsd !== undefined)
        byModel.push({ model: m.model, usd: m.costUsd, source: 'estimate' })
    byModel.sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0))
    cost = { totalUsd: summary.costUsd, source: 'cost-state', byModel, unpricedModels, coversSubagents: true }
  } else {
    const total = subs.length > 0 ? (acc.priced ? acc.estimate : undefined) : mainEstimate
    cost = {
      ...(total !== undefined ? { totalUsd: total, source: 'estimate' as const } : {}),
      byModel: models
        .map((m) => ({ model: m.model, usd: m.costUsd, source: 'estimate' as const }))
        .sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0)),
      unpricedModels,
      coversSubagents: subs.length > 0,
    }
  }

  const tools = [...acc.tools.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  const prompt = promptTokens(acc.tokens)

  const stats: SessionStats = {
    totals: {
      turns: session.turns.filter((t) => t.kind === 'human').length,
      assistantMessages,
      toolCalls,
      toolErrors,
      subagents: session.subagents.length,
      subagentsUploaded: session.subagents.filter((s) => s.fileKey).length,
      wallMs: summary.durationMs,
      thinkingMs,
      interrupts,
      compactions,
    },
    tokens: acc.tokens,
    cost,
    tools,
    models,
    contextSeries,
    compactionMarks,
    includedSubagents: subs.length,
  }
  if (summary.activeMs) stats.totals.activeMs = summary.activeMs
  const gaps = computeTurnGaps(session.turns, session.raw)
  if (gaps) stats.turnGaps = gaps
  if (prompt > 0) stats.cacheHitRate = acc.tokens.cacheReadTokens / prompt
  if (summary.startedAt) stats.startedAt = summary.startedAt
  if (summary.endedAt) stats.endedAt = summary.endedAt
  return stats
}
