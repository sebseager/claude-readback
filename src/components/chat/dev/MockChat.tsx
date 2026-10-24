// Dev-only: renders the hand-written mock session (`/#mock`, `/#mock-long`) with a minimal search bar,
// so the chat UI can be developed before the parser is wired in. Excluded from production builds.
import { ChevronDown, ChevronUp, Search } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { IconButton } from '@/components/common/IconButton'
import { buildLongMockSession, buildMockSession } from '@/lib/transcript/mock'
import { useChatStore } from '../chatStore'
import { MessageList } from '../MessageList'
import { useSearchNavigation } from '../search'

export default function MockChat({ variant }: { variant: 'mock' | 'mock-long' }) {
  const session = useMemo(() => (variant === 'mock' ? buildMockSession() : buildLongMockSession()), [variant])
  const query = useChatStore((s) => s.searchQuery)
  const setQuery = useChatStore((s) => s.setSearchQuery)
  const { hits, index, next, prev } = useSearchNavigation(session)
  // Handles for scripted screenshots / poking around in devtools.
  useEffect(() => {
    Object.assign(window, { __chatStore: useChatStore, __mockSession: session })
  }, [session])
  return (
    <>
      <div className="sticky top-0 z-10 border-b border-border bg-main/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-1.5 px-6 py-2">
          <span className="rounded-full bg-accent/12 px-2 py-px text-[11px] font-medium text-accent-hover dark:text-accent">
            mock
          </span>
          <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-main px-2.5 text-[13px] focus-within:ring-2 focus-within:ring-ring/40">
            <Search className="size-3.5 text-fg-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.shiftKey ? prev : next)()
              }}
              placeholder="Search this conversation"
              aria-label="Search this conversation"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-fg-muted"
            />
            {query && (
              <span className="text-[12px] text-fg-muted tabular-nums">
                {hits.length ? `${index + 1 || '–'}/${hits.length}` : '0'}
              </span>
            )}
          </label>
          <IconButton label="Previous match" onClick={prev} disabled={!hits.length}>
            <ChevronUp />
          </IconButton>
          <IconButton label="Next match" onClick={next} disabled={!hits.length}>
            <ChevronDown />
          </IconButton>
        </div>
      </div>
      <MessageList session={session} />
    </>
  )
}
