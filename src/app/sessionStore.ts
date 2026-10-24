// Session library + the open session. Every heavy step (read, parse, fold, search, zip) runs in the
// transcript worker; this store only keeps summaries, a small LRU of folded sessions and view status.
import { toast } from '@/app/toast'
import { create } from 'zustand'
import type { Session, SessionSummary } from '@/lib/transcript/types'
import { transcriptWorker, type IngestResult, type TranscriptApi } from '@/workers/client'
import { batchFiles, isAcceptedName, pathOf } from './files'

/** Folded sessions kept on the main thread (sessionId → Session), most recently used last. */
export const LRU_SIZE = 3
const LAST_ACTIVE_KEY = 'cc-viewer:last-session'

export interface IngestProgress {
  /** Files in this ingest. */
  count: number
  /** 0..1 */
  progress: number
}

export interface IngestOutcome {
  added: SessionSummary[]
  updated: SessionSummary[]
  attached: number
  errors: IngestResult['errors']
  skipped: string[]
  /** Session that was activated afterwards, if any. */
  activated?: string
}

export interface SessionState {
  sessions: SessionSummary[]
  /** True once the first `refreshList` finished. */
  listLoaded: boolean
  activeSessionId: string | null
  activeSession?: Session
  loading: boolean
  error?: string
  /** Lazily loaded subagent transcripts of the active session, by file key. */
  subagentSessions: Record<string, Session>
  subagentErrors: Record<string, string>
  /** Subagent shown in the full-size viewer (file key). */
  subagentViewKey: string | null
  ingesting: IngestProgress | null

  boot: () => Promise<void>
  refreshList: () => Promise<SessionSummary[]>
  ingestFiles: (files: File[]) => Promise<IngestOutcome | undefined>
  open: (sessionId: string, opts?: { force?: boolean }) => Promise<void>
  openSubagent: (fileKey: string) => Promise<Session | undefined>
  viewSubagent: (fileKey: string | null) => void
  remove: (sessionId: string) => Promise<void>
  exportSession: (sessionId: string) => Promise<void>
  clearAll: () => Promise<void>
}

// ----------------------------------------------------------------------------------- injection

let api: TranscriptApi = transcriptWorker
/** Tests: run against an in-process TranscriptService. */
export function setTranscriptApi(next: TranscriptApi): void {
  api = next
  lru.clear()
  inflightSub.clear()
}

/** The backend in use (worker in the browser, injected service in tests). */
export const getTranscriptApi = (): TranscriptApi => api

const lru = new Map<string, Session>()
function remember(id: string, s: Session) {
  lru.delete(id)
  lru.set(id, s)
  while (lru.size > LRU_SIZE) {
    const oldest = lru.keys().next().value
    if (oldest === undefined) break
    lru.delete(oldest)
  }
}
/** Session ids currently held in the main-thread LRU, oldest first (for tests / debugging). */
export const cachedSessionIds = (): string[] => [...lru.keys()]

const inflightSub = new Map<string, Promise<Session | undefined>>()
let openSeq = 0

const readLastActive = (): string | null => {
  try {
    return localStorage.getItem(LAST_ACTIVE_KEY)
  } catch {
    return null
  }
}
const writeLastActive = (id: string | null) => {
  try {
    if (id) localStorage.setItem(LAST_ACTIVE_KEY, id)
    else localStorage.removeItem(LAST_ACTIVE_KEY)
  } catch {
    // storage unavailable
  }
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** "Added 1 session · attached 3 subagents" (empty when nothing happened). */
export function describeIngest(o: Pick<IngestOutcome, 'added' | 'updated' | 'attached'>): string {
  const parts: string[] = []
  if (o.added.length) parts.push(`Added ${plural(o.added.length, 'session')}`)
  if (o.attached) parts.push(`${parts.length ? 'attached' : 'Attached'} ${plural(o.attached, 'subagent')}`)
  if (!o.added.length && o.updated.length && !o.attached)
    parts.push(`Updated ${plural(o.updated.length, 'session')}`)
  return parts.join(' · ')
}

const newest = (list: SessionSummary[]) =>
  [...list].sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0))[0]

export const useSessionStore = create<SessionState>()((set, get) => ({
  sessions: [],
  listLoaded: false,
  activeSessionId: null,
  activeSession: undefined,
  loading: false,
  error: undefined,
  subagentSessions: {},
  subagentErrors: {},
  subagentViewKey: null,
  ingesting: null,

  boot: async () => {
    const list = await get().refreshList()
    if (get().activeSessionId || list.length === 0) return
    const last = readLastActive()
    const pick = list.find((s) => s.sessionId === last) ?? list[0]
    await get().open(pick.sessionId)
  },

  refreshList: async () => {
    try {
      const sessions = await api.listSessions()
      set({ sessions, listLoaded: true })
      return sessions
    } catch (err) {
      set({ listLoaded: true })
      toast.error('Could not read the session library', { description: message(err) })
      return get().sessions
    }
  },

  ingestFiles: async (files) => {
    const accepted = files.filter((f) => isAcceptedName(pathOf(f)))
    const skipped = files.filter((f) => !isAcceptedName(pathOf(f))).map(pathOf)
    if (accepted.length === 0) {
      if (skipped.length)
        toast.error('Nothing to add', {
          description: `Only .jsonl transcripts and .meta.json files are accepted (${plural(skipped.length, 'file')} skipped).`,
        })
      return undefined
    }
    const batches = batchFiles(accepted.map((f) => ({ file: f, path: pathOf(f), size: f.size })))
    const total = accepted.reduce((n, f) => n + f.size, 0) || 1
    const outcome: IngestOutcome = { added: [], updated: [], attached: 0, errors: [], skipped }
    const parents = new Set<string>()
    let done = 0
    set({ ingesting: { count: accepted.length, progress: 0 } })
    try {
      for (const batch of batches) {
        const res = await api.ingestBlobs(batch.map((b) => ({ name: b.path, blob: b.file })))
        outcome.added.push(...res.added)
        outcome.updated.push(...res.updated)
        outcome.errors.push(...res.errors)
        outcome.attached += res.attachedSubagents.length
        for (const a of res.attachedSubagents) if (a.parentPresent) parents.add(a.sessionId)
        done += batch.reduce((n, b) => n + b.size, 0)
        set({ ingesting: { count: accepted.length, progress: done / total } })
      }
    } catch (err) {
      outcome.errors.push({ file: 'ingest', message: message(err) })
    } finally {
      set({ ingesting: null })
    }

    // Changed sessions must be re-read (subagents attached, file replaced).
    for (const s of [...outcome.added, ...outcome.updated]) lru.delete(s.sessionId)
    await get().refreshList()

    const target = newest(outcome.added)?.sessionId ?? [...parents][0]
    const active = get().activeSessionId
    if (target) {
      outcome.activated = target
      await get().open(target, { force: true })
    } else if (active && outcome.updated.some((s) => s.sessionId === active)) {
      await get().open(active, { force: true })
    }

    const summary = describeIngest(outcome)
    if (summary) toast.success(summary)
    else if (outcome.attached === 0 && outcome.errors.length === 0)
      toast('Nothing new', { description: 'These files were already in the library.' })
    if (outcome.attached && parents.size === 0)
      toast('Subagent transcripts stored', {
        description: 'They attach automatically when their parent session is added.',
      })
    if (outcome.errors.length) {
      const first = outcome.errors.slice(0, 3).map((e) => {
        const where = e.line !== undefined ? `${e.file}:${e.line + 1}` : e.file
        return `${where.split('/').pop()}: ${e.message}`
      })
      toast.error(plural(outcome.errors.length, 'problem'), {
        description: first.join('\n') + (outcome.errors.length > 3 ? '\n…' : ''),
      })
    }
    return outcome
  },

  open: async (sessionId, opts) => {
    const seq = ++openSeq
    const cached = opts?.force ? undefined : lru.get(sessionId)
    const prev = get().activeSessionId
    const keepSubs = prev === sessionId && !opts?.force
    writeLastActive(sessionId)
    if (cached) {
      remember(sessionId, cached)
      set({
        activeSessionId: sessionId,
        activeSession: cached,
        loading: false,
        error: undefined,
        ...(keepSubs ? {} : { subagentSessions: {}, subagentErrors: {}, subagentViewKey: null }),
      })
      return
    }
    set({
      activeSessionId: sessionId,
      activeSession: prev === sessionId ? get().activeSession : undefined,
      loading: true,
      error: undefined,
      ...(keepSubs ? {} : { subagentSessions: {}, subagentErrors: {}, subagentViewKey: null }),
    })
    try {
      const session = await api.openSession(sessionId)
      if (seq !== openSeq) return
      remember(sessionId, session)
      set({ activeSession: session, loading: false })
    } catch (err) {
      if (seq !== openSeq) return
      set({ activeSession: undefined, loading: false, error: message(err) })
    }
  },

  openSubagent: (fileKey) => {
    const have = get().subagentSessions[fileKey]
    if (have) return Promise.resolve(have)
    const pending = inflightSub.get(fileKey)
    if (pending) return pending
    const owner = get().activeSessionId
    const p = api
      .openSubagent(fileKey)
      .then((session) => {
        if (get().activeSessionId !== owner) return undefined
        set((s) => ({ subagentSessions: { ...s.subagentSessions, [fileKey]: session } }))
        return session
      })
      .catch((err: unknown) => {
        set((s) => ({ subagentErrors: { ...s.subagentErrors, [fileKey]: message(err) } }))
        return undefined
      })
      .finally(() => inflightSub.delete(fileKey))
    inflightSub.set(fileKey, p)
    return p
  },

  viewSubagent: (fileKey) => {
    set({ subagentViewKey: fileKey })
    if (fileKey) void get().openSubagent(fileKey)
  },

  remove: async (sessionId) => {
    try {
      await api.deleteSession(sessionId)
    } catch (err) {
      toast.error('Delete failed', { description: message(err) })
      return
    }
    lru.delete(sessionId)
    const list = await get().refreshList()
    if (get().activeSessionId === sessionId) {
      set({
        activeSessionId: null,
        activeSession: undefined,
        error: undefined,
        subagentSessions: {},
        subagentErrors: {},
        subagentViewKey: null,
      })
      writeLastActive(null)
      if (list[0]) await get().open(list[0].sessionId)
    }
    toast('Session deleted')
  },

  exportSession: async (sessionId) => {
    try {
      const bundle = await api.exportBundle(sessionId)
      downloadData(bundle.data, bundle.fileName, bundle.mime)
      toast.success(
        bundle.fileCount > 1
          ? `Exported ${bundle.fileName} (${plural(bundle.fileCount, 'file')})`
          : `Exported ${bundle.fileName}`,
      )
    } catch (err) {
      toast.error('Export failed', { description: message(err) })
    }
  },

  clearAll: async () => {
    try {
      await api.clearAll()
    } catch (err) {
      toast.error('Could not clear data', { description: message(err) })
      return
    }
    lru.clear()
    writeLastActive(null)
    set({
      activeSessionId: null,
      activeSession: undefined,
      loading: false,
      error: undefined,
      subagentSessions: {},
      subagentErrors: {},
      subagentViewKey: null,
    })
    await get().refreshList()
    toast('All data cleared')
  },
}))

/** Save bytes/text as a download. */
export function downloadData(data: string | Uint8Array, fileName: string, mime: string): void {
  const blob = new Blob([data as BlobPart], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
