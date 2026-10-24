// foldSession: raw records → Session (docs/superpowers/research/jsonl-format.md §12.1).
import { recordByLine } from '../parse'
import { newPasteCounter } from '../prompt'
import { buildSearchIndex } from '../search'
import { linkSubagents } from '../subagents'
import type { AbandonedBranch, RawRecord, Session, SubagentFileInfo, Turn } from '../types'
import { promptPreview, contentText } from '../prompt'
import { get } from '../util'
import { type Branching, computeBranching } from './active'
import { TurnBuilder } from './builder'
import { handleAttachment, handleSystem, handleUser } from './records'
import { collectMeta, computeSummary } from './summary'

export interface FoldOptions {
  /** Storage key of this file (used as the id of subagent sessions). */
  fileKey?: string
  /** Uploaded subagent transcripts that may belong to this transcript. */
  subagentFiles?: SubagentFileInfo[]
  /** Force the summary's sessionId. */
  sessionId?: string
  /** Set when folding a subagent transcript. */
  agentId?: string
  agentMeta?: Record<string, unknown>
}

/** Metadata record types (no uuid): consumed by collectMeta, not rendered as rows. */
const META_TYPES = new Set([
  'last-prompt',
  'ai-title',
  'atis-latch',
  'mode',
  'permission-mode',
  'agent-name',
  'cost-state',
  'continued-in',
  'queue-operation',
  'file-history-snapshot',
  'file-history-delta',
  'fork-context-ref',
  'summary',
])

function runBuilder(
  b: TurnBuilder,
  records: readonly RawRecord[],
  include: (r: RawRecord) => boolean,
  inlineSidechain: boolean,
) {
  for (const r of records) {
    if (typeof r.uuid === 'string' && r.uuid !== '') {
      if (!include(r)) continue
      if (inlineSidechain && r.isSidechain === true) {
        b.addHidden(r, 'Sidechain record', JSON.stringify(r).slice(0, 20_000))
        continue
      }
      switch (r.type) {
        case 'user':
          handleUser(b, r)
          break
        case 'assistant':
          b.handleAssistant(r)
          break
        case 'attachment':
          handleAttachment(b, r)
          break
        case 'system':
          handleSystem(b, r)
          break
        case 'progress':
          b.addHidden(r, 'Progress', JSON.stringify(get(r, 'data') ?? r).slice(0, 20_000))
          break
        default:
          b.addEvent(r, { category: 'other', label: `Unknown record: ${r.type}`, level: 'info' })
      }
    } else if (!META_TYPES.has(r.type)) {
      b.addEvent(r, { category: 'other', label: `Unknown record: ${r.type}`, level: 'info' })
    }
  }
  b.finalizeGroups()
  if (b.pendingHidden.length) {
    const first = b.pendingHidden[0]
    const turn =
      b.cur ?? b.openTurn('meta', { line: first.recordLine, type: 'meta' }, `ctx-turn-${first.recordLine}`)
    for (const h of b.pendingHidden) {
      h.id = h.id || b.uniqueId(`ctx-${h.recordLine}`)
      turn.hiddenContext.push(h)
    }
    b.pendingHidden = []
  }
}

function firstPromptPreview(records: readonly RawRecord[]): string | undefined {
  for (const r of records) {
    if (r.type !== 'user' || r.isMeta === true) continue
    const text = contentText(get(r, 'message', 'content'))
    if (text && !text.trimStart().startsWith('<') && !text.startsWith('[Request interrupted'))
      return promptPreview(text, 120)
  }
  return undefined
}

function buildAbandoned(
  branching: Branching,
  main: TurnBuilder,
  ids: Set<string>,
  snapshots: Map<string, RawRecord>,
): AbandonedBranch[] {
  const out: AbandonedBranch[] = []
  // Active children by parent, to find the sibling that replaced a branch.
  const activeUserByParent = new Map<string, string>()
  for (const u of branching.active) {
    const r = branching.byUuid.get(u)
    if (r?.type === 'user' && typeof r.parentUuid === 'string' && !activeUserByParent.has(r.parentUuid))
      activeUserByParent.set(r.parentUuid, u)
  }
  for (const group of branching.abandoned) {
    const root = group[0]
    const forkAfterUuid = typeof root.parentUuid === 'string' ? root.parentUuid : ''
    const b = new TurnBuilder(ids, newPasteCounter(), snapshots)
    runBuilder(b, group, () => true, false)
    const siblingUuid = forkAfterUuid ? activeUserByParent.get(forkAfterUuid) : undefined
    const replacedByTurnId = siblingUuid ? main.rowIdByUuid.get(siblingUuid) : undefined
    const anchorRowId =
      (forkAfterUuid && main.rowIdByUuid.get(forkAfterUuid)) || replacedByTurnId || main.turns[0]?.id || ''
    const branch: AbandonedBranch = { forkAfterUuid, anchorRowId, records: group, turns: b.turns }
    const preview = firstPromptPreview(group)
    if (preview) branch.firstPromptPreview = preview
    if (replacedByTurnId) branch.replacedByTurnId = replacedByTurnId
    out.push(branch)
  }
  return out
}

export function foldSession(records: RawRecord[], opts: FoldOptions = {}): Session {
  const meta = collectMeta(records)
  const branching = computeBranching(records)

  let uuidCount = 0
  let sidechainCount = 0
  for (const r of branching.byUuid.values()) {
    uuidCount++
    if (r.isSidechain === true) sidechainCount++
  }
  const isSubagent =
    opts.agentId !== undefined ||
    meta.forkRef !== undefined ||
    (uuidCount > 0 && sidechainCount * 2 > uuidCount)
  // Older formats wrote sidechains inline in the main file (unverified): keep them out of the main flow.
  const inlineSidechain = !isSubagent && sidechainCount > 0

  const ids = new Set<string>()
  const b = new TurnBuilder(ids, newPasteCounter(), meta.snapshots)
  runBuilder(
    b,
    records,
    (r) => branching.active.has(r.uuid as string) && !branching.duplicates.has(r),
    inlineSidechain,
  )

  const abandoned = buildAbandoned(branching, b, ids, meta.snapshots)
  const abandonedRecordCount = abandoned.reduce((n, a) => n + a.records.length, 0)

  const turns: Turn[] = b.turns
  const subagents = linkSubagents({
    agentTools: b.agentTools.map((e) => e.block),
    turns,
    files: opts.subagentFiles ?? [],
    selfAgentId: isSubagent ? (opts.agentId ?? '') : undefined,
    openingRecord: (t) => (t.recordLines?.length ? recordByLine(records, t.recordLines[0]) : undefined),
  })

  const summary = computeSummary({
    records,
    meta,
    turns,
    groups: b.groups.values(),
    subagents,
    abandonedRecordCount,
    fileKey: opts.fileKey,
    sessionIdOverride: opts.sessionId,
    agentId: opts.agentId,
    agentMeta: opts.agentMeta,
    isSubagent,
  })

  return { summary, turns, abandoned, subagents, raw: records, searchIndex: buildSearchIndex(turns) }
}
