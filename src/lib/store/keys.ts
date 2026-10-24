// Pure helpers for the IndexedDB layout (DESIGN.md "Persistence"). Tested without IndexedDB.
import type { SessionSummary, StoredFile } from '../transcript/types'
import { safeId, safeRelativePath } from '../transcript/util'

/** Session id used for meta files whose session is not known yet. */
export const UNLINKED = ''

/** Ids are normally slugified by classifyFile already; this is the last line of defense for keys. */
const seg = (id: string) => safeId(id) ?? '_'

export const mainKey = (sessionId: string) => seg(sessionId)
export const subagentKey = (sessionId: string, agentId: string) =>
  `${seg(sessionId)}/subagents/agent-${seg(agentId)}.jsonl`
export const metaKey = (sessionId: string, agentId: string) =>
  `${sessionId ? seg(sessionId) : '_unlinked'}/subagents/agent-${seg(agentId)}.meta.json`

/** Workflow files keep their path below the session dir when the drop carried one. */
export function workflowKey(sessionId: string, name: string): string {
  const sid = seg(sessionId)
  const norm = safeRelativePath(name)
  const parts = norm.split('/')
  const at = parts.indexOf(sid)
  if (at >= 0 && at < parts.length - 1) return parts.slice(at).map(seg).join('/')
  return `${sid}/workflows/${seg(parts[parts.length - 1] ?? 'workflow.json')}`
}

/** File name to use when exporting: `<sessionId>.jsonl` for the main file, the key path otherwise. */
export const exportName = (f: Pick<StoredFile, 'key' | 'role' | 'sessionId'>) =>
  safeRelativePath(f.role === 'main' ? `${seg(f.sessionId)}.jsonl` : f.key) || 'transcript.jsonl'

/** Newest first by startedAt (sessions without timestamps last), then by session id. */
export function sortSummaries(list: SessionSummary[]): SessionSummary[] {
  return [...list].sort((a, b) => {
    if (a.startedAt !== b.startedAt) {
      if (!a.startedAt) return 1
      if (!b.startedAt) return -1
      return a.startedAt < b.startedAt ? 1 : -1
    }
    return a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0
  })
}

/** Export order: main first, then subagents / meta by key. */
export function sortForExport(files: StoredFile[]): StoredFile[] {
  const rank = (f: StoredFile) => (f.role === 'main' ? 0 : 1)
  return [...files].sort((a, b) => rank(a) - rank(b) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}
