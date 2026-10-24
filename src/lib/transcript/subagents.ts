// Subagent discovery and linking (§8, §12.1 step 5), and classification of dropped files.
import type { RawRecord, SubagentFileInfo, SubagentRef, ToolBlock, Turn } from './types'
import { basename, get, isObj, obj, safeId, str } from './util'

// ------------------------------------------------------------------------------------ linking

export interface LinkInput {
  /** Agent / Task tool blocks of this transcript, in order. */
  agentTools: ToolBlock[]
  turns: Turn[]
  files: SubagentFileInfo[]
  /** Set when folding a subagent transcript: only files whose meta.parentAgentId matches are its children. */
  selfAgentId?: string
  /** Opening record of a turn (for fork linking via fork-context-ref.parentLastUuid). */
  openingRecord?: (turn: Turn) => RawRecord | undefined
}

const AGENT_ID_IN_TEXT = /agentId:\s*([A-Za-z0-9_-]+)/

const resultText = (block: ToolBlock): string =>
  (block.result?.content ?? []).map((c) => (c.type === 'text' ? c.text : '')).join('\n')

const metaStr = (f: SubagentFileInfo | undefined, k: string) => (f?.meta ? str(f.meta[k]) : undefined)

function applyFile(ref: SubagentRef, f: SubagentFileInfo) {
  ref.fileKey = f.fileKey
  if (f.meta) ref.meta = f.meta
  ref.agentType ??= metaStr(f, 'agentType')
  ref.description ??= metaStr(f, 'description') ?? metaStr(f, 'name')
  ref.model ??= metaStr(f, 'model')
  const parent = metaStr(f, 'parentAgentId')
  if (parent) ref.parentAgentId = parent
  ref.toolUseId ??= metaStr(f, 'toolUseId')
}

/**
 * Build the SubagentRefs of one transcript and attach them to Agent tool blocks, `/btw` fork commands
 * and task-notification / agent-message turns. Mutates blocks and turns; returns the refs.
 */
export function linkSubagents(input: LinkInput): SubagentRef[] {
  const { agentTools, turns, files, selfAgentId } = input
  const refs = new Map<string, SubagentRef>()
  const byToolUse = new Map<string, SubagentRef>()
  const fileByToolUse = new Map<string, SubagentFileInfo>()
  const fileByAgent = new Map<string, SubagentFileInfo>()
  for (const f of files) {
    fileByAgent.set(f.agentId, f)
    const tu = metaStr(f, 'toolUseId')
    if (tu) fileByToolUse.set(tu, f)
  }
  const used = new Set<string>()

  for (const block of agentTools) {
    const s = obj(block.result?.structured)
    const input = obj(block.input) ?? {}
    const file = fileByToolUse.get(block.id)
    const agentId = str(s?.agentId) ?? file?.agentId ?? AGENT_ID_IN_TEXT.exec(resultText(block))?.[1]
    if (!agentId) continue
    const status = str(s?.status)
    const ref: SubagentRef = {
      agentId,
      toolUseId: block.id,
      description: str(s?.description) ?? str(input.description),
      agentType: str(input.subagent_type),
      model: str(s?.resolvedModel) ?? str(input.model),
      status:
        !block.result || block.result.isError ? 'unknown' : status === 'completed' ? 'completed' : 'launched',
    }
    if (status === 'completed') {
      const content = Array.isArray(s?.content) ? s.content : []
      const text = content
        .map((c) => (isObj(c) && typeof c.text === 'string' ? c.text : ''))
        .join('\n')
        .trim()
      if (text) ref.handback = text
    }
    const f = file ?? fileByAgent.get(agentId)
    if (f) {
      applyFile(ref, f)
      used.add(f.agentId)
    }
    block.subagent = ref
    refs.set(agentId, ref)
    byToolUse.set(block.id, ref)
  }

  // Files not linked to a tool block: forks (`/btw`), nested agents, agents whose call is not in this file.
  for (const f of files) {
    if (used.has(f.agentId) || refs.has(f.agentId)) continue
    const parent = metaStr(f, 'parentAgentId')
    if (selfAgentId !== undefined && parent !== selfAgentId) continue
    const ref: SubagentRef = { agentId: f.agentId, status: 'unknown' }
    applyFile(ref, f)
    refs.set(f.agentId, ref)
    if (ref.toolUseId) byToolUse.set(ref.toolUseId, ref)
  }

  for (const turn of turns) {
    const p = turn.prompt
    if (!p) continue
    if (turn.kind === 'task-notification' && p.notification) {
      const n = p.notification
      const ref = (n.toolUseId && byToolUse.get(n.toolUseId)) || (n.taskId && refs.get(n.taskId)) || undefined
      if (ref) {
        turn.subagent = ref
        if (n.status === 'completed') ref.status = 'completed'
      }
    } else if (turn.kind === 'agent-message' && p.agentMessage) {
      const ref = refs.get(p.agentMessage.from)
      if (ref) {
        turn.subagent = ref
        if (p.agentMessage.handback) {
          ref.handback = p.agentMessage.body
          ref.status = 'completed'
        }
      }
    } else if (turn.kind === 'slash-command' && p.command?.name === '/btw') {
      const name = /forked\s+(\S+)/.exec(p.command.stdout ?? '')?.[1]
      const opening = input.openingRecord?.(turn)
      let ref: SubagentRef | undefined
      for (const r of refs.values()) {
        if (r.toolUseId) continue
        const f = fileByAgent.get(r.agentId)
        const byName =
          name !== undefined && (metaStr(f, 'name') === name || r.agentId.startsWith(`a${name}-`))
        const byParent =
          !!f?.forkParentLastUuid && opening !== undefined && opening.parentUuid === f.forkParentLastUuid
        if (byName || byParent) {
          ref = r
          break
        }
      }
      if (ref) turn.subagent = ref
    }
  }
  return [...refs.values()]
}

// ------------------------------------------------------------------------------ file classifying

export type FileRole = 'main' | 'subagent' | 'meta' | 'workflow' | 'unknown'

export interface FileClass {
  role: FileRole
  /** Main: the session id. Subagent: the parent's session id (from records / fork-context-ref / path). */
  sessionId?: string
  agentId?: string
  /** Parsed meta.json (role 'meta'). */
  meta?: Record<string, unknown>
  /** fork-context-ref.parentLastUuid (fork subagents). */
  forkParentLastUuid?: string
  reason?: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const AGENT_JSONL = /^agent-(.+)\.jsonl$/
const AGENT_META = /^agent-(.+)\.meta\.json$/

/** `<sessionId>/subagents/…` in a relative path (folder drops / webkitRelativePath). */
const sessionFromPath = (name: string): string | undefined => {
  const m = /(?:^|[/\\])([^/\\]+)[/\\]subagents[/\\]/.exec(name)
  return m ? m[1] : undefined
}

interface HeadInfo {
  parsed: number
  sessionId?: string
  agentId?: string
  sidechain: boolean
  fork?: { agentId?: string; parentSessionId?: string; parentLastUuid?: string }
}

/** Look at the first few records only (files can be 25 MB). */
function scanHead(text: string, maxLines = 60): HeadInfo {
  const info: HeadInfo = { parsed: 0, sidechain: false }
  let uuidSession: string | undefined
  let metaSession: string | undefined
  let pos = 0
  for (let n = 0; n < maxLines && pos < text.length; n++) {
    let end = text.indexOf('\n', pos)
    if (end < 0) end = text.length
    const line = text.slice(pos, end).trim()
    pos = end + 1
    if (!line) continue
    let r: unknown
    try {
      r = JSON.parse(line)
    } catch {
      continue
    }
    if (!isObj(r)) continue
    info.parsed++
    if (r.type === 'fork-context-ref') {
      info.fork = {
        agentId: str(r.agentId),
        parentSessionId: str(r.parentSessionId),
        parentLastUuid: str(r.parentLastUuid),
      }
    }
    // Prefer the id on a conversation record over metadata records.
    const sid = str(r.sessionId)
    if (sid && typeof r.uuid === 'string') uuidSession ??= sid
    else if (sid) metaSession ??= sid
    if (r.isSidechain === true) info.sidechain = true
    info.agentId ??= str(r.agentId)
    if (uuidSession && info.agentId) break
  }
  info.sessionId = uuidSession ?? metaSession
  return info
}

/**
 * Decide where a dropped file belongs. Works on any arrival order: subagent files carry the parent's sessionId.
 * Session and agent ids come from file contents / names, so they are slugified (see `safeId`) before they
 * can reach a storage key or an exported archive path.
 */
export function classifyFile(name: string, text: string): FileClass {
  const c = classifyRaw(name, text)
  if (c.role === 'unknown') return c
  const out: FileClass = { ...c }
  if (c.sessionId !== undefined) {
    const sid = safeId(c.sessionId)
    if (sid === undefined) {
      if (c.role === 'main') return { role: 'unknown', reason: 'Invalid session id' }
      delete out.sessionId
    } else out.sessionId = sid
  }
  if (c.agentId !== undefined) {
    const aid = safeId(c.agentId)
    if (aid === undefined) return { role: 'unknown', reason: 'Invalid agent id' }
    out.agentId = aid
  }
  return out
}

function classifyRaw(name: string, text: string): FileClass {
  const base = basename(name)
  const metaMatch = AGENT_META.exec(base)
  if (metaMatch) {
    let meta: Record<string, unknown> | undefined
    try {
      const v: unknown = JSON.parse(text)
      if (isObj(v)) meta = v
    } catch {
      return { role: 'unknown', reason: 'Invalid meta.json' }
    }
    return { role: 'meta', agentId: metaMatch[1], sessionId: sessionFromPath(name), meta }
  }
  if (base.endsWith('.json')) {
    try {
      const v: unknown = JSON.parse(text)
      if (isObj(v) && (v.runId !== undefined || v.workflowName !== undefined))
        return { role: 'workflow', sessionId: sessionFromPath(name) ?? str(get(v, 'sessionId')) }
    } catch {
      /* fall through */
    }
    return { role: 'unknown', reason: 'Not a Claude Code transcript' }
  }
  if (base === 'journal.jsonl') return { role: 'workflow', sessionId: sessionFromPath(name) }

  const head = scanHead(text)
  if (head.parsed === 0) return { role: 'unknown', reason: 'No JSON records found' }
  const agentMatch = AGENT_JSONL.exec(base)
  if (agentMatch || (head.sidechain && head.agentId)) {
    return {
      role: 'subagent',
      agentId: agentMatch ? agentMatch[1] : head.agentId,
      sessionId: head.sessionId ?? head.fork?.parentSessionId ?? sessionFromPath(name),
      forkParentLastUuid: head.fork?.parentLastUuid,
    }
  }
  const stem = base.replace(/\.jsonl$/, '')
  const sessionId = UUID_RE.test(stem) ? stem : (head.sessionId ?? stem)
  return { role: 'main', sessionId }
}

/** Read `fork-context-ref.parentLastUuid` from a subagent transcript's first lines. */
export function forkParentOf(text: string): string | undefined {
  return scanHead(text, 3).fork?.parentLastUuid
}
