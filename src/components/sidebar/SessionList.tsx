import { useMemo } from 'react'
import { useSessionStore } from '@/app/sessionStore'
import { Skeleton } from '@/components/ui/skeleton'
import { dedupeContinued, filterSessions, groupSessions } from './grouping'
import { SessionRow } from './SessionRow'

type Props = {
  query: string
  /** Called after a row was picked (the mobile overlay closes itself). */
  onPicked?: () => void
}

/** Stored sessions grouped by day, filtered by the sidebar search. */
export function SessionList({ query, onPicked }: Props) {
  const sessions = useSessionStore((s) => s.sessions)
  const listLoaded = useSessionStore((s) => s.listLoaded)
  const activeId = useSessionStore((s) => s.activeSessionId)
  const open = useSessionStore((s) => s.open)
  const exportSession = useSessionStore((s) => s.exportSession)
  const remove = useSessionStore((s) => s.remove)
  const groups = useMemo(
    () => groupSessions(filterSessions(dedupeContinued(sessions, activeId), query)),
    [sessions, query, activeId],
  )

  const onSelect = useMemo(
    () => (id: string) => {
      void open(id)
      onPicked?.()
    },
    [open, onPicked],
  )
  const onExport = useMemo(() => (id: string) => void exportSession(id), [exportSession])
  const onDelete = useMemo(() => (id: string) => void remove(id), [remove])

  if (!listLoaded) {
    return (
      <div className="flex flex-col gap-2 px-2.5 pt-2" aria-busy>
        <Skeleton className="h-9 w-full bg-hover" />
        <Skeleton className="h-9 w-full bg-hover" />
      </div>
    )
  }
  if (sessions.length === 0) {
    return (
      <p className="px-2.5 pt-2 text-xs leading-relaxed text-fg-muted">
        No sessions yet. Upload or drop a <code className="font-mono">.jsonl</code> from{' '}
        <code className="font-mono">~/.claude/projects</code>, or a whole session folder.
      </p>
    )
  }
  if (groups.length === 0) {
    return <p className="px-2.5 pt-2 text-xs text-fg-muted">No conversations match “{query.trim()}”.</p>
  }
  return (
    <nav aria-label="Conversations" className="px-2 pb-4">
      {groups.map((group) => (
        <section key={group.label} className="mt-3 first:mt-1">
          <h3 className="px-2.5 pb-1 text-xs font-medium text-fg-muted">{group.label}</h3>
          <ul className="flex flex-col gap-px">
            {group.sessions.map((s) => (
              <li key={s.sessionId}>
                <SessionRow
                  session={s}
                  active={s.sessionId === activeId}
                  onSelect={onSelect}
                  onExport={onExport}
                  onDelete={onDelete}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  )
}
