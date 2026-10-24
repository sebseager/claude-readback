// Sidebar list model: filter, sort (newest first) and group sessions by day like claude.ai.
import { formatDuration } from '@/components/common/format'
import type { SessionSummary } from '@/lib/transcript/types'

export interface SessionGroup {
  label: string
  sessions: SessionSummary[]
}

const DAY = 86_400_000
const startOfDay = (t: number) => {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

const monthDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
const monthDayYear = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

/** "Today", "Yesterday", "This week", else "Oct 12" (with the year when it is not the current one). */
export function dayLabel(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return 'Undated'
  const today = startOfDay(now)
  const day = startOfDay(t)
  if (day >= today) return 'Today'
  if (day >= today - DAY) return 'Yesterday'
  if (day >= today - 6 * DAY) return 'This week'
  const sameYear = new Date(t).getFullYear() === new Date(now).getFullYear()
  return (sameYear ? monthDay : monthDayYear).format(t)
}

const time = (s: SessionSummary) => {
  const t = Date.parse(s.startedAt)
  return Number.isFinite(t) ? t : -Infinity
}

/** Newest first; ties broken by session id so the order is stable. */
export function sortSessions(list: readonly SessionSummary[]): SessionSummary[] {
  return [...list].sort((a, b) => time(b) - time(a) || a.sessionId.localeCompare(b.sessionId))
}

/** Case-insensitive match on title, project name, cwd, branch or session id. */
export function filterSessions(list: readonly SessionSummary[], query: string): SessionSummary[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...list]
  return list.filter((s) =>
    [s.title, s.projectName, s.cwd, s.gitBranch ?? '', s.sessionId].some((f) => f.toLowerCase().includes(q)),
  )
}

/**
 * A session that `continued-in` another stored session is folded into it: its records were copied into the
 * newer file, so the list shows one row (the newer). The older one stays reachable from the header's
 * "continued from" link, and stays listed while it is the open session.
 */
export function dedupeContinued(list: readonly SessionSummary[], keepId?: string | null): SessionSummary[] {
  const ids = new Set(list.map((s) => s.sessionId))
  return list.filter(
    (s) => s.sessionId === keepId || !s.continuedInSessionId || !ids.has(s.continuedInSessionId),
  )
}

/** Sorted, grouped by day; groups appear in time order and are never empty. */
export function groupSessions(list: readonly SessionSummary[], now: number = Date.now()): SessionGroup[] {
  const groups: SessionGroup[] = []
  for (const s of sortSessions(list)) {
    const label = dayLabel(s.startedAt, now)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.sessions.push(s)
    else groups.push({ label, sessions: [s] })
  }
  return groups
}

/** `projectName · N turns · duration` */
export function sessionSubtitle(s: SessionSummary): string {
  const parts = [s.projectName || s.cwd || 'unknown project']
  parts.push(`${s.turnCount} turn${s.turnCount === 1 ? '' : 's'}`)
  if (s.durationMs > 0) parts.push(formatDuration(s.durationMs))
  return parts.join(' · ')
}

const SOURCE_LABEL: Record<SessionSummary['titleSource'], string> = {
  'ai-title': 'AI-generated title',
  'agent-name': 'Agent name',
  'first-prompt': 'First prompt',
  command: 'First command',
  'last-prompt': 'Last prompt',
  'session-id': 'Session id',
}
export const titleSourceLabel = (s: SessionSummary['titleSource']) => SOURCE_LABEL[s] ?? s
