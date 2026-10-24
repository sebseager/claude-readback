// SessionSummary computation (§2.3 and §12.1 step 6).
import { estimateCostUsd } from '../../pricing'
import { promptPreview } from '../prompt'
import type { RawRecord, SessionSummary, SubagentRef, Turn, Usage } from '../types'
import { basename, num, str, tsMs } from '../util'
import type { GroupAcc } from './builder'

export interface SessionMeta {
  aiTitle?: string
  agentName?: string
  legacySummary?: string
  lastPrompt?: string
  costState?: RawRecord
  permissionMode?: string
  continuedIn?: string
  forkRef?: RawRecord
  /** file-history-snapshot by the uuid of the prompt record it precedes. */
  snapshots: Map<string, RawRecord>
}

export function collectMeta(records: readonly RawRecord[]): SessionMeta {
  const m: SessionMeta = { snapshots: new Map() }
  for (const r of records) {
    switch (r.type) {
      case 'ai-title':
        m.aiTitle = str(r.aiTitle) || m.aiTitle
        break
      case 'agent-name':
        m.agentName = str(r.agentName) || m.agentName
        break
      case 'summary':
        m.legacySummary = str(r.summary) || m.legacySummary
        break
      case 'last-prompt':
        m.lastPrompt = str(r.lastPrompt) ?? m.lastPrompt
        break
      case 'cost-state':
        m.costState = r
        break
      case 'permission-mode':
        m.permissionMode = str(r.permissionMode) ?? m.permissionMode
        break
      case 'continued-in':
        m.continuedIn = str(r.continuedInSessionId) ?? m.continuedIn
        break
      case 'fork-context-ref':
        m.forkRef ??= r
        break
      case 'file-history-snapshot': {
        const id = str(r.messageId)
        if (id && !m.snapshots.has(id)) m.snapshots.set(id, r)
        break
      }
    }
  }
  return m
}

/** A title for sessions without a typed prompt (SDK / command-only / notification-driven sessions). */
function otherPromptTitle(
  turns: readonly Turn[],
): { title: string; source: SessionSummary['titleSource'] } | undefined {
  for (const t of turns) {
    const p = t.prompt
    if (!p) continue
    if (t.kind === 'slash-command' && p.command?.name) {
      const name =
        p.command.name.startsWith('/') || p.command.name === '!' ? p.command.name : `/${p.command.name}`
      const label = p.command.args ? `${name} ${p.command.args}` : name
      return { title: promptPreview(label, 80), source: 'command' }
    }
    if (t.kind === 'task-notification' && p.notification?.summary)
      return { title: promptPreview(p.notification.summary, 80), source: 'first-prompt' }
    if (t.kind === 'agent-message' && p.agentMessage?.body)
      return { title: promptPreview(p.agentMessage.body, 80), source: 'first-prompt' }
  }
  return undefined
}

export interface SummaryInput {
  records: readonly RawRecord[]
  meta: SessionMeta
  turns: readonly Turn[]
  groups: Iterable<GroupAcc>
  subagents: readonly SubagentRef[]
  abandonedRecordCount: number
  fileKey?: string
  sessionIdOverride?: string
  agentId?: string
  agentMeta?: Record<string, unknown>
  isSubagent: boolean
}

const SYNTHETIC = '<synthetic>'

export function computeSummary(x: SummaryInput): SessionSummary {
  const { records, meta, turns } = x
  let recSession: string | undefined
  let metaSession: string | undefined
  let cwd = ''
  let gitBranch: string | undefined
  let entrypoint: string | undefined
  let userPermissionMode: string | undefined
  let recAgentId: string | undefined
  let minT = Infinity
  let maxT = -Infinity
  let minIso = ''
  let maxIso = ''
  const versions: string[] = []
  const seenVersions = new Set<string>()
  for (const r of records) {
    const sid = str(r.sessionId)
    if (sid) {
      if (typeof r.uuid === 'string') recSession ??= sid
      else metaSession ??= sid
    }
    if (!cwd) cwd = str(r.cwd) ?? ''
    const branch = str(r.gitBranch)
    if (branch) gitBranch = branch
    entrypoint ??= str(r.entrypoint)
    recAgentId ??= str(r.agentId)
    if (r.type === 'user') userPermissionMode = str(r.permissionMode) ?? userPermissionMode
    const v = str(r.version)
    if (v && !seenVersions.has(v)) {
      seenVersions.add(v)
      versions.push(v)
    }
    const ts = str(r.timestamp)
    const t = tsMs(ts)
    if (ts && t !== undefined) {
      if (t < minT) {
        minT = t
        minIso = ts
      }
      if (t > maxT) {
        maxT = t
        maxIso = ts
      }
    }
  }
  const parentSessionId = recSession ?? metaSession ?? str(meta.forkRef?.parentSessionId)
  const agentId = x.agentId ?? recAgentId ?? str(meta.forkRef?.agentId)
  const sessionId =
    x.sessionIdOverride ??
    (x.isSubagent ? (x.fileKey ?? `agent-${agentId ?? 'unknown'}`) : parentSessionId) ??
    (x.fileKey ? basename(x.fileKey).replace(/\.jsonl$/, '') : 'unknown')

  // Title precedence: ai-title → agent-name → first human prompt (or legacy summary) → first other prompt
  // (slash command, task notification, agent message) → last-prompt record → session id.
  let title = ''
  let titleSource: SessionSummary['titleSource'] = 'session-id'
  if (meta.aiTitle) {
    title = meta.aiTitle
    titleSource = 'ai-title'
  } else if (meta.agentName) {
    title = meta.agentName
    titleSource = 'agent-name'
  } else {
    const first = turns.find((t) => t.kind === 'human' && t.prompt)
    const preview = first?.prompt ? promptPreview(first.prompt.rawText, 80) : ''
    const fallback = preview || (meta.legacySummary ? promptPreview(meta.legacySummary, 80) : '')
    const other = fallback ? undefined : otherPromptTitle(turns)
    const last = meta.lastPrompt ? promptPreview(meta.lastPrompt, 80) : ''
    if (fallback) {
      title = fallback
      titleSource = 'first-prompt'
    } else if (other) {
      title = other.title
      titleSource = other.source
    } else if (last) {
      title = last
      titleSource = 'last-prompt'
    } else title = sessionId
  }

  // Tokens and cost over active assistant groups.
  const tokens: Usage = {
    inputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    final: true,
  }
  const models: string[] = []
  const seenModels = new Set<string>()
  let estimate = 0
  let priced = false
  let groupCount = 0
  for (const g of x.groups) {
    groupCount++
    const u = g.item.usage
    tokens.inputTokens += u.inputTokens
    tokens.cacheReadTokens += u.cacheReadTokens
    tokens.cacheWriteTokens += u.cacheWriteTokens
    tokens.outputTokens += u.outputTokens
    if (!u.final) tokens.final = false
    const model = g.item.model
    if (model && model !== SYNTHETIC && model !== 'unknown' && !seenModels.has(model)) {
      seenModels.add(model)
      models.push(model)
    }
    const c = model === SYNTHETIC ? 0 : estimateCostUsd(model, { ...u, cacheWrite1hTokens: g.cacheWrite1h })
    if (c !== undefined) {
      estimate += c
      priced = true
    }
  }

  let toolCallCount = 0
  let activeMs = 0
  let thinkingMs = 0
  let turnCount = 0
  for (const t of turns) {
    if (t.kind === 'human') turnCount++
    if (t.durationMs) activeMs += t.durationMs
    for (const item of t.items) {
      if (item.kind !== 'assistant') continue
      for (const b of item.blocks) {
        if (b.kind === 'tool') toolCallCount++
        else if (b.kind === 'thinking' && b.durationMs) thinkingMs += b.durationMs
      }
    }
  }

  const costUsdState = num(meta.costState?.totalCostUSD)
  const summary: SessionSummary = {
    sessionId,
    title,
    titleSource,
    cwd,
    projectName: cwd ? basename(cwd) : '',
    startedAt: minIso,
    endedAt: maxIso,
    durationMs: minIso && maxIso ? maxT - minT : 0,
    turnCount,
    assistantMessageCount: groupCount,
    toolCallCount,
    subagentCount: x.subagents.length,
    subagentFilesPresent: x.subagents.filter((s) => s.fileKey).length,
    models,
    versions,
    tokens,
    activeMs,
    thinkingMs,
    recordCount: records.length,
    abandonedRecordCount: x.abandonedRecordCount,
  }
  if (gitBranch) summary.gitBranch = gitBranch
  if (entrypoint) summary.entrypoint = entrypoint
  const pm = meta.permissionMode ?? userPermissionMode
  if (pm) summary.permissionMode = pm
  if (costUsdState !== undefined) {
    summary.costUsd = costUsdState
    summary.costSource = 'cost-state'
  } else if (priced) {
    summary.costUsd = estimate
    summary.costSource = 'estimate'
  }
  if (meta.continuedIn) summary.continuedInSessionId = meta.continuedIn
  if (meta.lastPrompt) summary.lastPrompt = meta.lastPrompt
  if (x.isSubagent) {
    summary.parent = { sessionId: parentSessionId ?? '', agentId: agentId ?? '' }
    const tu = x.agentMeta ? str(x.agentMeta.toolUseId) : undefined
    if (tu) summary.parent.toolUseId = tu
  }
  return summary
}
