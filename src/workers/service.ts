// TranscriptService: ingest / open / search over stored transcripts. Runs inside the worker
// (transcript.worker.ts) and directly in tests (no Worker in jsdom) with a MemoryStore.
import { strToU8, zipSync, type Zippable } from 'fflate'
import { type TranscriptStore, IdbStore, exportSessionFiles } from '../lib/store/db'
import { UNLINKED, mainKey, metaKey, subagentKey, workflowKey } from '../lib/store/keys'
import { foldSession } from '../lib/transcript/fold'
import { parseJsonl } from '../lib/transcript/parse'
import { searchSession } from '../lib/transcript/search'
import { classifyFile, forkParentOf } from '../lib/transcript/subagents'
import { safeId, safeRelativePath } from '../lib/transcript/util'
import type {
  SearchEntry,
  SearchMatch,
  Session,
  SessionSummary,
  StoredFile,
  SubagentFileInfo,
} from '../lib/transcript/types'

export interface InputFile {
  /** File name, or a relative path such as `<sessionId>/subagents/agent-x.jsonl`. */
  name: string
  text: string
}

/** A browser File/Blob plus the (relative) path it was picked or dropped with; read inside the worker. */
export interface InputBlob {
  name: string
  blob: Blob
}

/** One download: a single `.jsonl` (text) or a `.zip` of the session folder (bytes). */
export interface ExportBundle {
  fileName: string
  mime: string
  data: string | Uint8Array
  fileCount: number
}

export interface IngestError {
  file: string
  /** 0-based line for parse errors. */
  line?: number
  message: string
}

export interface AttachedSubagent {
  sessionId: string
  agentId: string
  fileKey: string
  /** False when the parent transcript is not stored yet (it attaches when it arrives). */
  parentPresent: boolean
}

export interface IngestResult {
  /** Main transcripts ingested in this call (new or replaced). */
  added: SessionSummary[]
  /** Already-stored sessions whose summary changed because subagent files attached to them. */
  updated: SessionSummary[]
  attachedSubagents: AttachedSubagent[]
  errors: IngestError[]
}

export interface SearchRequestOptions {
  /** Also search subagent transcripts opened (openSubagent) for this session. Default true. */
  includeSubagents?: boolean
  limit?: number
}

/** The async API the UI talks to (the worker exposes exactly this). */
export interface TranscriptApi {
  ingest(files: InputFile[]): Promise<IngestResult>
  /** Same as `ingest`, but reads the blobs off the main thread. */
  ingestBlobs(files: InputBlob[]): Promise<IngestResult>
  openSession(sessionId: string): Promise<Session>
  openSubagent(fileKey: string): Promise<Session>
  search(sessionId: string, query: string, opts?: SearchRequestOptions): Promise<SearchMatch[]>
  listSessions(): Promise<SessionSummary[]>
  deleteSession(sessionId: string): Promise<void>
  exportSession(sessionId: string): Promise<{ name: string; text: string }[]>
  /** `<sessionId>.jsonl` when the session is a single file, else a zip with the original layout. */
  exportBundle(sessionId: string): Promise<ExportBundle>
  clearAll(): Promise<void>
}

const MAX_ERRORS_PER_FILE = 20
const CACHE_SIZE = 3

const parseMeta = (text: string): Record<string, unknown> | undefined => {
  try {
    const v: unknown = JSON.parse(text)
    return typeof v === 'object' && v !== null && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

export class TranscriptService implements TranscriptApi {
  private readonly store: TranscriptStore
  /** Folded sessions, most recently used last (LRU of 3). Keyed by sessionId or subagent fileKey. */
  private readonly cache = new Map<string, Session>()
  private lastSession: { sessionId: string; index: SearchEntry[] } | undefined
  private readonly subIndexes = new Map<string, { sessionId: string; index: SearchEntry[] }>()

  constructor(store: TranscriptStore = new IdbStore()) {
    this.store = store
  }

  // ------------------------------------------------------------------------------------- ingest

  async ingest(files: InputFile[]): Promise<IngestResult> {
    const result: IngestResult = { added: [], updated: [], attachedSubagents: [], errors: [] }
    const addedAt = new Date().toISOString()
    const classified = files.map((f) => ({ f, c: classifyFile(f.name, f.text) }))
    const affected = new Set<string>()
    const mainsInBatch = new Set<string>()
    const agentSession = new Map<string, string>()

    for (const { c } of classified) {
      if (c.role === 'subagent' && c.agentId && c.sessionId) agentSession.set(c.agentId, c.sessionId)
    }

    for (const { f, c } of classified) {
      if (c.role === 'unknown') {
        result.errors.push({ file: f.name, message: c.reason ?? 'Unrecognized file' })
        continue
      }
      if (c.role === 'subagent') {
        if (!c.agentId || !c.sessionId) {
          result.errors.push({
            file: f.name,
            message: 'Cannot tell which session this subagent transcript belongs to',
          })
          continue
        }
        const key = subagentKey(c.sessionId, c.agentId)
        await this.store.putFile(this.stored(key, c.sessionId, 'subagent', f, addedAt, c.agentId))
        await this.relinkMeta(c.agentId, c.sessionId)
        affected.add(c.sessionId)
        result.attachedSubagents.push({
          sessionId: c.sessionId,
          agentId: c.agentId,
          fileKey: key,
          parentPresent: false,
        })
        this.invalidate(c.sessionId)
        this.cache.delete(key)
      } else if (c.role === 'meta') {
        const agentId = c.agentId as string
        // The transcript's records are authoritative; a folder name in the path is only a fallback.
        let sid = agentSession.get(agentId)
        sid ??= (await this.store.getFilesByAgentId(agentId)).find((x) => x.role === 'subagent')?.sessionId
        sid ??= c.sessionId
        const key = metaKey(sid ?? UNLINKED, agentId)
        await this.store.putFile(this.stored(key, sid ?? UNLINKED, 'meta', f, addedAt, agentId))
        if (sid) {
          affected.add(sid)
          this.invalidate(sid)
        }
      } else if (c.role === 'workflow') {
        if (!c.sessionId) {
          result.errors.push({
            file: f.name,
            message: 'Workflow file without a session folder; drop the whole session folder',
          })
          continue
        }
        await this.store.putFile(
          this.stored(workflowKey(c.sessionId, f.name), c.sessionId, 'workflow', f, addedAt),
        )
      }
    }

    for (const { f, c } of classified) {
      if (c.role !== 'main' || !c.sessionId) continue
      const { errors } = parseJsonl(f.text)
      for (const e of errors.slice(0, MAX_ERRORS_PER_FILE))
        result.errors.push({ file: f.name, line: e.line, message: e.message })
      await this.store.putFile(this.stored(mainKey(c.sessionId), c.sessionId, 'main', f, addedAt))
      affected.add(c.sessionId)
      mainsInBatch.add(c.sessionId)
      this.invalidate(c.sessionId)
    }

    const summaries: SessionSummary[] = []
    for (const sid of affected) {
      const session = await this.foldStored(sid).catch((err: unknown) => {
        result.errors.push({
          file: sid,
          message: `Fold failed: ${err instanceof Error ? err.message : String(err)}`,
        })
        return undefined
      })
      if (!session) continue
      if (mainsInBatch.has(sid)) this.remember(sid, session)
      summaries.push(session.summary)
      ;(mainsInBatch.has(sid) ? result.added : result.updated).push(session.summary)
    }
    await this.linkContinuations(summaries)
    for (const s of summaries) await this.store.putSessionSummary(s)
    for (const a of result.attachedSubagents)
      a.parentPresent = !!(await this.store.getFile(mainKey(a.sessionId)))
    return result
  }

  async ingestBlobs(files: InputBlob[]): Promise<IngestResult> {
    const read: InputFile[] = []
    const errors: IngestError[] = []
    for (const f of files) {
      try {
        read.push({ name: f.name, text: await f.blob.text() })
      } catch (err) {
        errors.push({
          file: f.name,
          message: `Could not read file: ${err instanceof Error ? err.message : String(err)}`,
        })
      }
    }
    const result = await this.ingest(read)
    result.errors.unshift(...errors)
    return result
  }

  private stored(
    key: string,
    sessionId: string,
    role: StoredFile['role'],
    f: InputFile,
    addedAt: string,
    agentId?: string,
  ): StoredFile {
    const file: StoredFile = {
      key,
      sessionId,
      role,
      name: f.name,
      size: f.text.length,
      addedAt,
      text: f.text,
    }
    if (agentId) file.agentId = agentId
    return file
  }

  /** A meta.json that arrived before its transcript may be unlinked or under a guessed session; move it. */
  private async relinkMeta(agentId: string, sessionId: string) {
    for (const m of await this.store.getFilesByAgentId(agentId)) {
      if (m.role !== 'meta' || m.sessionId === sessionId) continue
      await this.store.deleteFile(m.key)
      await this.store.putFile({ ...m, key: metaKey(sessionId, agentId), sessionId })
    }
  }

  /** Set continuedFromSessionId both ways between stored sessions linked by `continued-in`. */
  private async linkContinuations(fresh: SessionSummary[]) {
    const all = await this.store.listSessions()
    const byId = new Map(all.map((s) => [s.sessionId, s]))
    for (const s of fresh) byId.set(s.sessionId, s)
    for (const s of fresh) {
      const next = s.continuedInSessionId ? byId.get(s.continuedInSessionId) : undefined
      if (next && next.continuedFromSessionId !== s.sessionId) {
        next.continuedFromSessionId = s.sessionId
        if (!fresh.includes(next)) await this.store.putSessionSummary(next)
      }
      const prev = all.find((p) => p.continuedInSessionId === s.sessionId)
      if (prev) s.continuedFromSessionId = prev.sessionId
    }
  }

  // --------------------------------------------------------------------------------------- open

  private async subagentInfos(files: StoredFile[]): Promise<SubagentFileInfo[]> {
    const metas = new Map<string, Record<string, unknown>>()
    for (const f of files)
      if (f.role === 'meta' && f.agentId) {
        const m = parseMeta(f.text)
        if (m) metas.set(f.agentId, m)
      }
    const out: SubagentFileInfo[] = []
    for (const f of files) {
      if (f.role !== 'subagent' || !f.agentId) continue
      const info: SubagentFileInfo = { agentId: f.agentId, fileKey: f.key }
      const meta = metas.get(f.agentId)
      if (meta) info.meta = meta
      const fork = forkParentOf(f.text)
      if (fork) info.forkParentLastUuid = fork
      out.push(info)
    }
    return out
  }

  private async foldStored(sessionId: string): Promise<Session | undefined> {
    const files = await this.store.getFilesForSession(sessionId)
    const main = files.find((f) => f.role === 'main')
    if (!main) return undefined
    const { records } = parseJsonl(main.text)
    const prev = await this.store.getSessionSummary(sessionId)
    const session = foldSession(records, {
      fileKey: main.key,
      sessionId,
      subagentFiles: await this.subagentInfos(files),
    })
    if (prev?.continuedFromSessionId) session.summary.continuedFromSessionId = prev.continuedFromSessionId
    return session
  }

  private remember(key: string, session: Session) {
    this.cache.delete(key)
    this.cache.set(key, session)
    while (this.cache.size > CACHE_SIZE) {
      const oldest = this.cache.keys().next().value
      if (oldest === undefined) break
      this.cache.delete(oldest)
    }
  }

  private invalidate(sessionId: string) {
    this.cache.delete(sessionId)
    if (this.lastSession?.sessionId === sessionId) this.lastSession = undefined
  }

  async openSession(sessionId: string): Promise<Session> {
    let session = this.cache.get(sessionId)
    if (!session) {
      session = await this.foldStored(sessionId)
      if (!session) throw new Error(`Session ${sessionId} is not stored`)
    }
    this.remember(sessionId, session)
    if (this.lastSession?.sessionId !== sessionId) {
      for (const [k, v] of this.subIndexes) if (v.sessionId !== sessionId) this.subIndexes.delete(k)
    }
    this.lastSession = { sessionId, index: session.searchIndex }
    return session
  }

  async openSubagent(fileKey: string): Promise<Session> {
    let session = this.cache.get(fileKey)
    const file = await this.store.getFile(fileKey)
    if (!file || file.role !== 'subagent') throw new Error(`Subagent transcript ${fileKey} is not stored`)
    if (!session) {
      const agentId = file.agentId ?? ''
      const siblings = await this.store.getFilesForSession(file.sessionId)
      const infos = await this.subagentInfos(siblings.filter((f) => f.key !== fileKey))
      const ownMeta = siblings.find((f) => f.role === 'meta' && f.agentId === agentId)
      const { records } = parseJsonl(file.text)
      session = foldSession(records, {
        fileKey,
        agentId,
        agentMeta: ownMeta ? parseMeta(ownMeta.text) : undefined,
        subagentFiles: infos,
      })
    }
    this.remember(fileKey, session)
    this.subIndexes.set(fileKey, { sessionId: file.sessionId, index: session.searchIndex })
    return session
  }

  // ------------------------------------------------------------------------------------- search

  async search(sessionId: string, query: string, opts: SearchRequestOptions = {}): Promise<SearchMatch[]> {
    if (this.lastSession?.sessionId !== sessionId) await this.openSession(sessionId)
    const limit = opts.limit ?? 5000
    const index = this.lastSession?.index ?? []
    const out = searchSession(index, query, { limit })
    if (opts.includeSubagents !== false) {
      for (const [fileKey, sub] of this.subIndexes) {
        if (sub.sessionId !== sessionId || out.length >= limit) continue
        out.push(...searchSession(sub.index, query, { limit: limit - out.length, fileKey }))
      }
    }
    return out
  }

  // ------------------------------------------------------------------------------------ library

  listSessions(): Promise<SessionSummary[]> {
    return this.store.listSessions()
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.store.deleteSession(sessionId)
    this.invalidate(sessionId)
    for (const [k, v] of this.subIndexes) if (v.sessionId === sessionId) this.subIndexes.delete(k)
    for (const k of [...this.cache.keys()]) if (k.startsWith(`${sessionId}/`)) this.cache.delete(k)
  }

  exportSession(sessionId: string): Promise<{ name: string; text: string }[]> {
    return exportSessionFiles(sessionId, this.store)
  }

  async exportBundle(sessionId: string): Promise<ExportBundle> {
    const files = await exportSessionFiles(sessionId, this.store)
    if (files.length === 0) throw new Error(`Session ${sessionId} is not stored`)
    const base = safeId(sessionId) ?? 'session'
    if (files.length === 1)
      return { fileName: `${base}.jsonl`, mime: 'application/x-ndjson', data: files[0].text, fileCount: 1 }
    const tree: Zippable = {}
    for (const f of files) {
      // Keys are slugified at ingest; normalize again so no member can climb out of the archive root.
      const name = safeRelativePath(f.name)
      if (name) tree[name] = strToU8(f.text)
    }
    return {
      fileName: `${base}.zip`,
      mime: 'application/zip',
      data: zipSync(tree, { level: 6 }),
      fileCount: files.length,
    }
  }

  async clearAll(): Promise<void> {
    await this.store.clearAll()
    this.cache.clear()
    this.subIndexes.clear()
    this.lastSession = undefined
  }
}
