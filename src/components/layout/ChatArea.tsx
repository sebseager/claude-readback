import { AlertTriangle, RotateCw } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSessionStore } from '@/app/sessionStore'
import { useUiStore } from '@/app/store'
import { createRawLookup } from '@/components/chat/chatContext'
import { MessageList } from '@/components/chat/MessageList'
import { ChatScrollContext } from '@/components/chat/scrollContext'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import type { Session, SubagentRef } from '@/lib/transcript/types'
import { cn } from '@/lib/utils'
import { EmptyState } from './EmptyState'
import { SubagentTranscript } from './SubagentTranscript'

// Dev-only preview of the chat UI with a hand-written session: open `/#mock` or `/#mock-long`.
const MockChat = import.meta.env.DEV ? lazy(() => import('@/components/chat/dev/MockChat')) : null

/**
 * Scrollable chat region: the open session's message list, a skeleton while it opens, an error, or the
 * empty state. The <main> element is the virtualizer's scroll container, published through ChatScrollContext.
 */
export function ChatArea({ children }: { children?: ReactNode }) {
  const chatFont = useUiStore((s) => s.chatFont)
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null)
  const mock = useMockHash()
  const content =
    children ??
    (MockChat && mock ? (
      <Suspense fallback={null}>
        <MockChat variant={mock} />
      </Suspense>
    ) : (
      <SessionContent />
    ))
  return (
    <main
      ref={setScrollEl}
      data-testid="chat-scroll"
      className={cn(
        'scrollbar-thin relative min-h-0 flex-1 overflow-y-auto bg-main',
        chatFont === 'serif' && 'font-chat-serif',
      )}
    >
      <ChatScrollContext.Provider value={scrollEl}>{content}</ChatScrollContext.Provider>
      <SubagentViewer />
    </main>
  )
}

function SessionContent() {
  const session = useSessionStore((s) => s.activeSession)
  const loading = useSessionStore((s) => s.loading)
  const error = useSessionStore((s) => s.error)
  const activeId = useSessionStore((s) => s.activeSessionId)
  const open = useSessionStore((s) => s.open)
  const hasSessions = useSessionStore((s) => s.sessions.length > 0)

  if (error && activeId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center" role="alert">
        <AlertTriangle className="size-8 text-danger" />
        <h2 className="font-serif text-2xl tracking-tight">This session could not be opened</h2>
        <p className="max-w-md text-sm break-words text-fg-secondary">{error}</p>
        <Button variant="outline" className="gap-2" onClick={() => void open(activeId, { force: true })}>
          <RotateCw />
          Try again
        </Button>
      </div>
    )
  }
  if (session && !(loading && session.summary.sessionId !== activeId))
    return <SessionView session={session} />
  if (loading) return <ChatSkeleton />
  if (hasSessions)
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-fg-muted">
        Pick a conversation from the sidebar.
      </div>
    )
  return <EmptyState />
}

function SessionView({ session }: { session: Session }) {
  const openSubagent = useSessionStore((s) => s.openSubagent)
  const viewSubagent = useSessionStore((s) => s.viewSubagent)
  const getRaw = useMemo(() => createRawLookup(session).getRaw, [session])
  const onOpenSubagent = useCallback(
    (ref: SubagentRef) => {
      if (!ref.fileKey) return
      void openSubagent(ref.fileKey)
      viewSubagent(ref.fileKey)
    },
    [openSubagent, viewSubagent],
  )
  return (
    <MessageList
      session={session}
      getRaw={getRaw}
      onOpenSubagent={onOpenSubagent}
      renderSubagentTranscript={renderSubagentTranscript}
    />
  )
}

/** Stable renderer for nested subagent transcripts (inside SubagentCard). */
function renderSubagentTranscript(ref: SubagentRef): ReactNode {
  return <SubagentTranscript subagent={ref} renderNested={renderSubagentTranscript} />
}

/** "Open on its own": a subagent transcript in a large dialog. */
function SubagentViewer() {
  const fileKey = useSessionStore((s) => s.subagentViewKey)
  const viewSubagent = useSessionStore((s) => s.viewSubagent)
  const session = useSessionStore((s) => (fileKey ? s.subagentSessions[fileKey] : undefined))
  const parent = useSessionStore((s) => s.activeSession)
  const ref = useMemo<SubagentRef | undefined>(() => {
    if (!fileKey) return undefined
    const known = parent?.subagents.find((r) => r.fileKey === fileKey)
    if (known) return known
    const agentId = session?.summary.parent?.agentId ?? fileKey.replace(/^.*agent-|\.jsonl$/g, '')
    return { agentId, fileKey, status: 'unknown' }
  }, [fileKey, parent, session])
  return (
    <Dialog open={!!fileKey} onOpenChange={(o) => !o && viewSubagent(null)}>
      <DialogContent className="flex h-[88vh] w-[min(64rem,calc(100vw-2rem))] max-w-none flex-col gap-3 bg-main sm:max-w-none">
        <DialogHeader>
          <DialogTitle className="truncate pr-6 font-serif text-lg font-medium tracking-tight">
            {session?.summary.title ?? ref?.description ?? 'Subagent transcript'}
          </DialogTitle>
          <DialogDescription className="sr-only">Subagent transcript</DialogDescription>
        </DialogHeader>
        {ref && (
          <div className="min-h-0 flex-1">
            <SubagentTranscript subagent={ref} fill renderNested={renderSubagentTranscript} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ChatSkeleton() {
  return (
    <div
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 pt-8"
      aria-busy
      data-testid="chat-skeleton"
    >
      <Skeleton className="ml-auto h-14 w-2/3 rounded-xl bg-bubble" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-11/12 bg-hover" />
        <Skeleton className="h-4 w-4/5 bg-hover" />
        <Skeleton className="h-4 w-3/5 bg-hover" />
      </div>
      <Skeleton className="h-10 w-full rounded-xl bg-hover" />
      <Skeleton className="ml-auto h-10 w-1/2 rounded-xl bg-bubble" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-5/6 bg-hover" />
        <Skeleton className="h-4 w-2/3 bg-hover" />
      </div>
    </div>
  )
}

function readMockHash(): 'mock' | 'mock-long' | null {
  if (!import.meta.env.DEV || typeof location === 'undefined') return null
  return location.hash === '#mock' ? 'mock' : location.hash === '#mock-long' ? 'mock-long' : null
}

function useMockHash() {
  const [mock, setMock] = useState(readMockHash)
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const onHash = () => setMock(readMockHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return mock
}
