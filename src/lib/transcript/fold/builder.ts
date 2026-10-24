// Turn builder: the mutable state of one fold pass (§12.1 step 4) plus assistant grouping and
// tool_result pairing. Record-type handlers that open turns / add events live in records.ts.
import { type PasteCounter, contentText } from '../prompt'
import { summarizeTool } from '../tools'
import type {
  AssistantItem,
  Block,
  EventItem,
  HiddenContextItem,
  RawRecord,
  ToolAttachment,
  ToolBlock,
  ToolResult,
  ToolResultContent,
  Turn,
  TurnItem,
  TurnKind,
  Usage,
} from '../types'
import { arr, durationMs, get, isObj, num, obj, str, tsMs } from '../util'

export interface ToolEntry {
  block: ToolBlock
  item: AssistantItem
  recordUuid?: string
}

interface GroupRecord {
  rec: RawRecord
  order: number
  blocks: Block[]
}

export interface GroupAcc {
  item: AssistantItem
  records: GroupRecord[]
  /** 1-hour cache-write tokens of the usage record (for pricing). */
  cacheWrite1h: number
}

const MAX_HIDDEN_TEXT = 200_000

export const emptyUsage = (): Usage => ({
  inputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  outputTokens: 0,
  final: true,
})

const readUsage = (u: unknown, final: boolean): Usage => ({
  inputTokens: num(get(u, 'input_tokens')) ?? 0,
  cacheReadTokens: num(get(u, 'cache_read_input_tokens')) ?? 0,
  cacheWriteTokens: num(get(u, 'cache_creation_input_tokens')) ?? 0,
  outputTokens: num(get(u, 'output_tokens')) ?? 0,
  final,
})

export const capText = (s: string, max = MAX_HIDDEN_TEXT): string =>
  s.length > max ? `${s.slice(0, max)}\n… [${s.length - max} more characters, see raw JSON]` : s

export const jsonDump = (v: unknown): string => {
  try {
    return capText(JSON.stringify(v, null, 2) ?? '')
  } catch {
    return String(v)
  }
}

/** `rendered[].content` joined: the exact text an attachment injected into the model context. */
export const renderedText = (r: RawRecord): string => {
  const rendered = arr(r.rendered)
  if (!rendered) return ''
  const parts: string[] = []
  for (const x of rendered) {
    const c = get(x, 'content')
    if (typeof c === 'string') parts.push(c)
  }
  return parts.join('\n\n')
}

export class TurnBuilder {
  readonly turns: Turn[] = []
  cur: Turn | undefined
  /** promptId that opened the current turn (meta-turn detection). */
  curPromptId: string | undefined
  readonly rowIdByUuid = new Map<string, string>()
  readonly tools = new Map<string, ToolEntry>()
  readonly toolsByRecordUuid = new Map<string, ToolEntry[]>()
  readonly groups = new Map<string, GroupAcc>()
  readonly agentTools: ToolEntry[] = []
  /** Hidden items (e.g. local-command caveats) waiting for the next turn to open. */
  pendingHidden: HiddenContextItem[] = []
  private order = 0

  readonly ids: Set<string>
  readonly pastes: PasteCounter
  readonly snapshots: Map<string, RawRecord>

  constructor(ids: Set<string>, pastes: PasteCounter, snapshots: Map<string, RawRecord>) {
    this.ids = ids
    this.pastes = pastes
    this.snapshots = snapshots
  }

  uniqueId(base: string): string {
    let id = base
    for (let n = 2; this.ids.has(id); n++) id = `${base}~${n}`
    this.ids.add(id)
    return id
  }

  baseId(r: RawRecord, prefix = ''): string {
    return `${prefix}${typeof r.uuid === 'string' && r.uuid ? r.uuid : `line-${r.line}`}`
  }

  openTurn(kind: TurnKind, r: RawRecord, idBase?: string): Turn {
    const promptId = str(r.promptId)
    const turn: Turn = {
      id: this.uniqueId(idBase ?? promptId ?? this.baseId(r)),
      kind,
      startedAt: str(r.timestamp) ?? '',
      items: [],
      hiddenContext: this.pendingHidden,
      recordLines: [r.line],
    }
    for (const h of this.pendingHidden) h.id = h.id || this.uniqueId(`ctx-${h.recordLine}`)
    this.pendingHidden = []
    const snap = typeof r.uuid === 'string' ? this.snapshots.get(r.uuid) : undefined
    if (snap) {
      const backups = obj(get(snap, 'snapshot', 'trackedFileBackups'))
      turn.checkpoint = { fileCount: backups ? Object.keys(backups).length : 0, recordLine: snap.line }
    }
    this.turns.push(turn)
    this.cur = turn
    this.curPromptId = promptId
    this.mapRow(r, turn.id)
    return turn
  }

  /** The current turn, opening a "session start" meta turn for records before the first prompt. */
  ensureTurn(r: RawRecord): Turn {
    return this.cur ?? this.openTurn('meta', r, this.baseId(r, 'start-'))
  }

  mapRow(r: RawRecord, rowId: string) {
    if (typeof r.uuid === 'string') this.rowIdByUuid.set(r.uuid, rowId)
  }

  addItem(r: RawRecord, item: TurnItem) {
    this.ensureTurn(r).items.push(item)
    this.mapRow(r, item.id)
  }

  addEvent(
    r: RawRecord,
    e: Omit<EventItem, 'kind' | 'id' | 'recordLines'> & { recordLines?: number[] },
  ): EventItem {
    const item: EventItem = {
      kind: 'event',
      id: this.uniqueId(this.baseId(r, 'ev-')),
      recordLines: e.recordLines ?? [r.line],
      ...e,
    }
    if (item.at === undefined) item.at = str(r.timestamp)
    this.addItem(r, item)
    return item
  }

  addHidden(r: RawRecord, label: string, text: string, opts: { pending?: boolean } = {}) {
    const item: HiddenContextItem = {
      id: opts.pending ? '' : this.uniqueId(this.baseId(r, 'ctx-')),
      label,
      recordLine: r.line,
      text: capText(text),
    }
    if (opts.pending) {
      this.pendingHidden.push(item)
      return
    }
    const turn = this.ensureTurn(r)
    turn.hiddenContext.push(item)
    this.mapRow(r, turn.id)
  }

  addToolAttachment(r: RawRecord, entry: ToolEntry, a: Omit<ToolAttachment, 'id' | 'recordLine'>) {
    entry.block.attachments.push({ id: this.uniqueId(this.baseId(r, 'att-')), recordLine: r.line, ...a })
    this.mapRow(r, entry.item.id)
  }

  // ------------------------------------------------------------------------------------ assistant

  handleAssistant(r: RawRecord) {
    const message = obj(r.message) ?? {}
    const mid = str(message.id) ?? this.baseId(r, 'msg-')
    let acc = this.groups.get(mid)
    if (!acc) {
      const ts = str(r.timestamp) ?? ''
      const item: AssistantItem = {
        kind: 'assistant',
        id: this.uniqueId(mid),
        requestId: str(r.requestId),
        model: str(message.model) ?? 'unknown',
        requestedModel: str(r.requestedModel),
        effort: str(r.effort) ?? str(r.perTurnEffort),
        blocks: [],
        usage: emptyUsage(),
        stopReason: null,
        startedAt: ts,
        endedAt: ts,
        recordLines: [],
      }
      const agent = str(r.attributionAgent)
      if (agent) item.agent = agent
      acc = { item, records: [], cacheWrite1h: 0 }
      this.groups.set(mid, acc)
      this.addItem(r, item)
    } else {
      this.mapRow(r, acc.item.id)
    }
    const item = acc.item
    item.recordLines.push(r.line)
    if (!item.requestId) item.requestId = str(r.requestId)
    if (r.isAbortedMidStream === true) item.aborted = true
    if (r.isApiErrorMessage === true || r.error !== undefined) {
      const text = contentText(message.content) || (typeof r.error === 'string' ? r.error : 'API error')
      item.error = { status: num(r.apiErrorStatus), text }
    }
    const miss = str(get(message, 'diagnostics', 'cache_miss_reason', 'type'))
    if (miss) item.cacheMiss = miss
    const ts = str(r.timestamp)
    if (ts) {
      const t = tsMs(ts) ?? 0
      if (!item.startedAt || t < (tsMs(item.startedAt) ?? Infinity)) item.startedAt = ts
      if (!item.endedAt || t > (tsMs(item.endedAt) ?? -Infinity)) item.endedAt = ts
    }

    const blocks: Block[] = []
    const content =
      arr(message.content) ??
      (typeof message.content === 'string' ? [{ type: 'text', text: message.content }] : [])
    content.forEach((b, k) => {
      const base = k === 0 ? this.baseId(r) : `${this.baseId(r)}:${k}`
      const block = this.makeBlock(r, b, base, item)
      if (block) blocks.push(block)
    })
    acc.records.push({ rec: r, order: this.order++, blocks })
  }

  private makeBlock(r: RawRecord, b: unknown, base: string, item: AssistantItem): Block | undefined {
    if (!isObj(b)) return { kind: 'unknown', id: this.uniqueId(base), raw: b }
    switch (b.type) {
      case 'text':
        return { kind: 'text', id: this.uniqueId(base), markdown: str(b.text) ?? '' }
      case 'thinking':
        return {
          kind: 'thinking',
          id: this.uniqueId(base),
          text: str(b.thinking) ?? '',
          durationMs: durationMs(r.thinkingDurationMs),
        }
      case 'redacted_thinking':
        return {
          kind: 'thinking',
          id: this.uniqueId(base),
          text: '',
          redacted: true,
          durationMs: durationMs(r.thinkingDurationMs),
        }
      case 'fallback':
        return {
          kind: 'fallback',
          id: this.uniqueId(base),
          from: str(get(b, 'from', 'model')) ?? str(b.from) ?? '?',
          to: str(get(b, 'to', 'model')) ?? str(b.to) ?? '?',
        }
      case 'tool_use': {
        const toolId = str(b.id)
        const name = str(b.name) ?? 'unknown'
        const block: ToolBlock = {
          kind: 'tool',
          id: this.uniqueId(toolId ?? base),
          name,
          input: b.input,
          summary: summarizeTool(name, b.input),
          attachments: [],
          startedAt: str(r.timestamp) ?? '',
          recordLine: r.line,
        }
        const entry: ToolEntry = { block, item, recordUuid: r.uuid }
        if (toolId && !this.tools.has(toolId)) this.tools.set(toolId, entry)
        if (r.uuid) {
          const list = this.toolsByRecordUuid.get(r.uuid)
          if (list) list.push(entry)
          else this.toolsByRecordUuid.set(r.uuid, [entry])
        }
        if (name === 'Agent' || name === 'Task') this.agentTools.push(entry)
        return block
      }
      default:
        return { kind: 'unknown', id: this.uniqueId(base), raw: b }
    }
  }

  /** Sort blocks by apiBlockIndex (file order fallback) and pick the usage record. */
  finalizeGroups() {
    for (const acc of this.groups.values()) {
      const recs = acc.records
      const key = (g: GroupRecord) => {
        const idx = num(g.rec.apiBlockIndex)
        return idx === undefined ? Number.MAX_SAFE_INTEGER : idx
      }
      const sorted = [...recs].sort((a, b) => key(a) - key(b) || a.order - b.order)
      acc.item.blocks = sorted.flatMap((g) => g.blocks)
      acc.item.recordLines.sort((a, b) => a - b)
      let usageRec: RawRecord | undefined
      for (const g of recs) {
        const sr = get(g.rec, 'message', 'stop_reason')
        if (sr !== null && sr !== undefined) usageRec = g.rec
      }
      const final = usageRec !== undefined
      const src = usageRec ?? recs[recs.length - 1]?.rec
      if (!src) continue
      const u = get(src, 'message', 'usage')
      acc.item.usage = readUsage(u, final)
      acc.cacheWrite1h = num(get(u, 'cache_creation', 'ephemeral_1h_input_tokens')) ?? 0
      const sr = get(src, 'message', 'stop_reason')
      acc.item.stopReason = typeof sr === 'string' ? sr : null
    }
  }

  // ---------------------------------------------------------------------------------- tool results

  /** Attach the record's tool_result blocks to their tool blocks; unmatched ones go to hidden context. */
  handleToolResults(r: RawRecord, blocks: unknown[]) {
    const structured = r.toolUseResult
    let usedStructured = false
    for (const b of blocks) {
      if (!isObj(b)) continue
      if (b.type !== 'tool_result') {
        const text = b.type === 'text' ? (str(b.text) ?? '') : jsonDump(b)
        if (text.trim()) this.addHidden(r, 'Text beside tool result', text)
        continue
      }
      const toolUseId = str(b.tool_use_id)
      let entry = toolUseId ? this.tools.get(toolUseId) : undefined
      if (!entry) {
        const src = str(r.sourceToolAssistantUUID)
        const list = src ? this.toolsByRecordUuid.get(src) : undefined
        entry = list?.find((e) => !e.block.result)
      }
      const result: ToolResult = {
        content: normalizeResultContent(b.content),
        isError: b.is_error === true,
        recordLine: r.line,
      }
      if (structured !== undefined && !usedStructured) {
        result.structured = structured
        usedStructured = true
      }
      const denied = str(r.toolDenialKind)
      if (denied) result.denied = denied
      else if (get(r, 'permissionDecision', 'decision') === 'reject') {
        result.denied = str(get(r, 'permissionDecision', 'reasonType')) ?? 'rejected'
      }
      const persisted = persistedPathOf(result)
      if (persisted !== undefined) result.persistedPath = persisted

      if (entry && !entry.block.result) {
        entry.block.result = result
        const ts = str(r.timestamp)
        if (ts) entry.block.endedAt = ts
        this.mapRow(r, entry.item.id)
      } else {
        const label = entry ? 'Duplicate tool result' : 'Tool result without a matching call'
        const text = result.content.map((c) => (c.type === 'text' ? c.text : `[${c.type}]`)).join('\n')
        this.addHidden(r, `${label}${toolUseId ? ` (${toolUseId})` : ''}`, text)
      }
    }
  }
}

export function normalizeResultContent(content: unknown): ToolResultContent[] {
  if (content === undefined || content === null) return []
  if (typeof content === 'string') return [{ type: 'text', text: content }]
  const list = arr(content)
  if (!list) return [{ type: 'unknown', raw: content }]
  const out: ToolResultContent[] = []
  for (const c of list) {
    if (!isObj(c)) {
      out.push(typeof c === 'string' ? { type: 'text', text: c } : { type: 'unknown', raw: c })
      continue
    }
    if (c.type === 'text') out.push({ type: 'text', text: str(c.text) ?? '' })
    else if (c.type === 'image')
      out.push({
        type: 'image',
        mediaType: str(get(c, 'source', 'media_type')) ?? 'image/png',
        base64: str(get(c, 'source', 'data')) ?? '',
      })
    else if (c.type === 'document')
      out.push({
        type: 'document',
        mediaType: str(get(c, 'source', 'media_type')) ?? 'application/pdf',
        base64: str(get(c, 'source', 'data')),
      })
    else out.push({ type: 'unknown', raw: c })
  }
  return out
}

const PERSISTED_RE = /saved to:?\s*(\S+)/

function persistedPathOf(result: ToolResult): string | undefined {
  const s = result.structured
  const fromStructured = str(get(s, 'persistedOutputPath'))
  if (fromStructured) return fromStructured
  for (const c of result.content) {
    if (c.type !== 'text') continue
    const at = c.text.indexOf('<persisted-output>')
    if (at < 0) continue
    const m = PERSISTED_RE.exec(c.text.slice(at, at + 2000))
    return m ? m[1] : ''
  }
  return undefined
}
