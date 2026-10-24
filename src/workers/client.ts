// Main-thread handle on the transcript worker. Lazily spawns the worker on first call.
// Without Worker / IndexedDB (jsdom tests, very old browsers) it falls back to an in-process
// TranscriptService over a MemoryStore, loaded with a dynamic import so it stays out of the main bundle.
import { wrap } from 'comlink'
import type { TranscriptApi } from './service'

export type {
  AttachedSubagent,
  ExportBundle,
  InputBlob,
  IngestError,
  IngestResult,
  InputFile,
  SearchRequestOptions,
  TranscriptApi,
} from './service'

let backend: Promise<TranscriptApi> | undefined

function getBackend(): Promise<TranscriptApi> {
  backend ??= (async (): Promise<TranscriptApi> => {
    if (typeof Worker !== 'undefined' && typeof indexedDB !== 'undefined') {
      const worker = new Worker(new URL('./transcript.worker.ts', import.meta.url), { type: 'module' })
      return wrap<TranscriptApi>(worker)
    }
    const [{ TranscriptService }, { MemoryStore }] = await Promise.all([
      import('./service'),
      import('../lib/store/db'),
    ])
    return new TranscriptService(new MemoryStore())
  })()
  return backend
}

/** Typed singleton. Every method is async and runs off the main thread when a Worker is available. */
export const transcriptWorker: TranscriptApi = {
  ingest: async (files) => (await getBackend()).ingest(files),
  ingestBlobs: async (files) => (await getBackend()).ingestBlobs(files),
  openSession: async (sessionId) => (await getBackend()).openSession(sessionId),
  openSubagent: async (fileKey) => (await getBackend()).openSubagent(fileKey),
  search: async (sessionId, query, opts) => (await getBackend()).search(sessionId, query, opts),
  listSessions: async () => (await getBackend()).listSessions(),
  deleteSession: async (sessionId) => (await getBackend()).deleteSession(sessionId),
  exportSession: async (sessionId) => (await getBackend()).exportSession(sessionId),
  exportBundle: async (sessionId) => (await getBackend()).exportBundle(sessionId),
  clearAll: async () => (await getBackend()).clearAll(),
}

/** Read browser File objects (picker / drop) into the `{name, text}` shape `ingest` takes. */
export async function readFiles(files: readonly File[]): Promise<{ name: string; text: string }[]> {
  return Promise.all(files.map(async (f) => ({ name: f.webkitRelativePath || f.name, text: await f.text() })))
}
