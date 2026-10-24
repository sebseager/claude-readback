// IndexedDB persistence (`idb`), database `cc-viewer` v1: stores `files` and `sessions`.
// Thin on purpose: the logic around it (TranscriptService, keys.ts) is tested against MemoryStore.
import { type DBSchema, type IDBPDatabase, openDB } from 'idb'
import type { SessionSummary, StoredFile, StoredSession } from '../transcript/types'
import { exportName, sortForExport, sortSummaries } from './keys'

export const DB_NAME = 'cc-viewer'
export const DB_VERSION = 1

interface CcViewerDB extends DBSchema {
  files: { key: string; value: StoredFile; indexes: { sessionId: string; agentId: string } }
  sessions: { key: string; value: StoredSession }
}

/** Storage interface shared by IndexedDB and the in-memory store (tests, no-IndexedDB fallback). */
export interface TranscriptStore {
  putFile(file: StoredFile): Promise<void>
  getFile(key: string): Promise<StoredFile | undefined>
  deleteFile(key: string): Promise<void>
  getFilesForSession(sessionId: string): Promise<StoredFile[]>
  getFilesByAgentId(agentId: string): Promise<StoredFile[]>
  putSessionSummary(summary: SessionSummary): Promise<void>
  getSessionSummary(sessionId: string): Promise<SessionSummary | undefined>
  /** Summaries sorted by startedAt, newest first. */
  listSessions(): Promise<SessionSummary[]>
  /** Delete the session row and every file with that sessionId (main, subagents, meta). */
  deleteSession(sessionId: string): Promise<void>
  clearAll(): Promise<void>
}

export class IdbStore implements TranscriptStore {
  private db: Promise<IDBPDatabase<CcViewerDB>> | undefined
  private readonly name: string

  constructor(name = DB_NAME) {
    this.name = name
  }

  private open(): Promise<IDBPDatabase<CcViewerDB>> {
    this.db ??= openDB<CcViewerDB>(this.name, DB_VERSION, {
      upgrade(db) {
        const files = db.createObjectStore('files', { keyPath: 'key' })
        files.createIndex('sessionId', 'sessionId')
        files.createIndex('agentId', 'agentId')
        db.createObjectStore('sessions', { keyPath: 'sessionId' })
      },
    })
    return this.db
  }

  async putFile(file: StoredFile) {
    await (await this.open()).put('files', file)
  }
  async getFile(key: string) {
    return (await this.open()).get('files', key)
  }
  async deleteFile(key: string) {
    await (await this.open()).delete('files', key)
  }
  async getFilesForSession(sessionId: string) {
    return (await this.open()).getAllFromIndex('files', 'sessionId', sessionId)
  }
  async getFilesByAgentId(agentId: string) {
    return (await this.open()).getAllFromIndex('files', 'agentId', agentId)
  }
  async putSessionSummary(summary: SessionSummary) {
    await (
      await this.open()
    ).put('sessions', { sessionId: summary.sessionId, summary, updatedAt: new Date().toISOString() })
  }
  async getSessionSummary(sessionId: string) {
    return (await (await this.open()).get('sessions', sessionId))?.summary
  }
  async listSessions() {
    const rows = await (await this.open()).getAll('sessions')
    return sortSummaries(rows.map((r) => r.summary))
  }
  async deleteSession(sessionId: string) {
    const db = await this.open()
    const tx = db.transaction(['files', 'sessions'], 'readwrite')
    const keys = await tx.objectStore('files').index('sessionId').getAllKeys(sessionId)
    await Promise.all([
      ...keys.map((k) => tx.objectStore('files').delete(k)),
      tx.objectStore('sessions').delete(sessionId),
      tx.done,
    ])
  }
  async clearAll() {
    const db = await this.open()
    const tx = db.transaction(['files', 'sessions'], 'readwrite')
    await Promise.all([tx.objectStore('files').clear(), tx.objectStore('sessions').clear(), tx.done])
  }
}

/** In-memory implementation with the same semantics. */
export class MemoryStore implements TranscriptStore {
  private files = new Map<string, StoredFile>()
  private sessions = new Map<string, StoredSession>()

  async putFile(file: StoredFile) {
    this.files.set(file.key, { ...file })
  }
  async getFile(key: string) {
    return this.files.get(key)
  }
  async deleteFile(key: string) {
    this.files.delete(key)
  }
  async getFilesForSession(sessionId: string) {
    return [...this.files.values()].filter((f) => f.sessionId === sessionId)
  }
  async getFilesByAgentId(agentId: string) {
    return [...this.files.values()].filter((f) => f.agentId === agentId)
  }
  async putSessionSummary(summary: SessionSummary) {
    this.sessions.set(summary.sessionId, {
      sessionId: summary.sessionId,
      summary,
      updatedAt: new Date().toISOString(),
    })
  }
  async getSessionSummary(sessionId: string) {
    return this.sessions.get(sessionId)?.summary
  }
  async listSessions() {
    return sortSummaries([...this.sessions.values()].map((r) => r.summary))
  }
  async deleteSession(sessionId: string) {
    for (const [k, f] of this.files) if (f.sessionId === sessionId) this.files.delete(k)
    this.sessions.delete(sessionId)
  }
  async clearAll() {
    this.files.clear()
    this.sessions.clear()
  }
}

// Module-level convenience API over a lazily opened default IndexedDB store.
let defaultStore: IdbStore | undefined
const store = () => (defaultStore ??= new IdbStore())

export const putFile = (file: StoredFile) => store().putFile(file)
export const getFile = (key: string) => store().getFile(key)
export const getFilesForSession = (sessionId: string) => store().getFilesForSession(sessionId)
export const putSessionSummary = (summary: SessionSummary) => store().putSessionSummary(summary)
export const listSessions = () => store().listSessions()
export const deleteSession = (sessionId: string) => store().deleteSession(sessionId)
export const clearAll = () => store().clearAll()

/** `{name, text}` for every stored file of a session (main first), named for re-import / zipping. */
export async function exportSessionFiles(
  sessionId: string,
  from: TranscriptStore = store(),
): Promise<{ name: string; text: string }[]> {
  const files = await from.getFilesForSession(sessionId)
  return sortForExport(files).map((f) => ({ name: exportName(f), text: f.text }))
}
