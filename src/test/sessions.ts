// Helpers for tests that drive the session store against an in-process TranscriptService.
import { setFilePath } from '@/app/files'
import { setTranscriptApi, useSessionStore } from '@/app/sessionStore'
import { useSearchStore } from '@/app/searchStore'
import { MemoryStore } from '@/lib/store/db'
import { TranscriptService } from '@/workers/service'
import { SYNTHETIC_SESSION_ID, allSyntheticFiles } from './fixtures'

/** Fresh service + empty stores. Returns the service so tests can spy on it. */
export function resetSessionStore(): TranscriptService {
  const svc = new TranscriptService(new MemoryStore())
  setTranscriptApi(svc)
  useSessionStore.setState({
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
  })
  useSearchStore.setState({ query: '', sessionId: null, matches: [], occ: [], index: -1, searching: false })
  try {
    localStorage.clear()
  } catch {
    // ignore
  }
  return svc
}

/** A browser File carrying a relative path, as the picker / a directory drop would hand it over. */
export const asFile = (f: { name: string; text: string }, path = f.name): File =>
  setFilePath(new File([f.text], path.split('/').pop() ?? path), path)

/** The synthetic session folder as Files (main + subagents + metas). */
export const syntheticFiles = (): File[] =>
  allSyntheticFiles().map((f) => asFile(f, f.name.replace('synthetic-session/', `${SYNTHETIC_SESSION_ID}/`)))

/** The synthetic main transcript stored under another session id (distinct library entries). */
export const syntheticCopy = (sessionId: string): File =>
  asFile({ name: `${sessionId}.jsonl`, text: allSyntheticFiles()[0].text })
