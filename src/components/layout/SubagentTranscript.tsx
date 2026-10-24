import { AlertCircle, Bot } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useSessionStore } from '@/app/sessionStore'
import { formatTokens } from '@/components/common/format'
import { MessageList } from '@/components/chat/MessageList'
import { ChatScrollContext } from '@/components/chat/scrollContext'
import { Skeleton } from '@/components/ui/skeleton'
import type { Session, SubagentRef } from '@/lib/transcript/types'
import { cn } from '@/lib/utils'
import { shortModel } from './sessionMeta'

const totalTokens = (s: Session) => {
  const t = s.summary.tokens
  return t.inputTokens + t.cacheReadTokens + t.cacheWriteTokens + t.outputTokens
}

/** One-line header above a nested transcript: agent id, model, N turns, tokens. */
export function SubagentHeader({ session, subagent }: { session: Session; subagent: SubagentRef }) {
  const s = session.summary
  const model = s.models[0] ?? subagent.model
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-fg-muted">
      <Bot className="size-3.5 shrink-0 text-accent" />
      <span className="font-mono text-fg-secondary">agent-{subagent.agentId}</span>
      {model && (
        <>
          <span aria-hidden>·</span>
          <span className="font-mono">{shortModel(model)}</span>
        </>
      )}
      <span aria-hidden>·</span>
      <span>
        {s.turnCount} turn{s.turnCount === 1 ? '' : 's'}
      </span>
      <span aria-hidden>·</span>
      <span className="tabular-nums">
        {s.tokens.final ? '' : '≥'}
        {formatTokens(totalTokens(session))} tokens
      </span>
    </div>
  )
}

/** Loads (lazily) and renders a subagent transcript stored under `subagent.fileKey`. */
export function SubagentTranscript({
  subagent,
  fill = false,
  renderNested,
}: {
  subagent: SubagentRef
  /** Fill the parent's height (full-size viewer) instead of capping at 70vh inside a card. */
  fill?: boolean
  renderNested: (ref: SubagentRef) => ReactNode
}) {
  const fileKey = subagent.fileKey
  const session = useSessionStore((s) => (fileKey ? s.subagentSessions[fileKey] : undefined))
  const error = useSessionStore((s) => (fileKey ? s.subagentErrors[fileKey] : undefined))
  const openSubagent = useSessionStore((s) => s.openSubagent)
  const viewSubagent = useSessionStore((s) => s.viewSubagent)
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    if (fileKey && !session && !error) void openSubagent(fileKey)
  }, [fileKey, session, error, openSubagent])

  if (!fileKey) return null
  if (error) {
    return (
      <p className="flex items-center gap-2 text-[12.5px] text-danger">
        <AlertCircle className="size-3.5" />
        Could not load the subagent transcript: {error}
      </p>
    )
  }
  if (!session) {
    return (
      <div className="flex flex-col gap-2" aria-busy data-testid="subagent-loading">
        <Skeleton className="h-4 w-1/2 bg-hover" />
        <Skeleton className="h-16 w-full bg-hover" />
      </div>
    )
  }
  return (
    <div
      className={cn('flex min-h-0 flex-col gap-2', fill && 'h-full')}
      data-testid="subagent-transcript"
      data-file-key={fileKey}
    >
      <SubagentHeader session={session} subagent={subagent} />
      <div
        ref={setScrollEl}
        className={cn(
          'scrollbar-thin overflow-y-auto rounded-lg border border-border bg-main/60',
          fill ? 'min-h-0 flex-1' : 'max-h-[70vh]',
        )}
      >
        {/* Own scroll container: the nested virtualizer must not follow the outer chat's scroll. */}
        <ChatScrollContext.Provider value={scrollEl}>
          {scrollEl && (
            <MessageList
              session={session}
              nested
              fileKey={fileKey}
              scrollElement={scrollEl}
              onOpenSubagent={(ref) => ref.fileKey && viewSubagent(ref.fileKey)}
              renderSubagentTranscript={renderNested}
              className={cn('max-w-none px-3 pt-1 pb-3', fill && 'mx-auto max-w-3xl px-6')}
            />
          )}
        </ChatScrollContext.Provider>
      </div>
    </div>
  )
}
