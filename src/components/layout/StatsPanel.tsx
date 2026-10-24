import { X } from 'lucide-react'
import { createElement, type ReactNode } from 'react'
import { useUiStore } from '@/app/store'
import { useMediaQuery } from '@/app/useMediaQuery'
import { IconButton } from '@/components/common/IconButton'
import { sessionStatsModule } from '@/components/stats/sessionStatsLoader'
import { StatCard } from '@/components/stats/StatCard'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import type { Session } from '@/lib/transcript/types'
import { cn } from '@/lib/utils'

const PLACEHOLDER_CARDS = ['Totals', 'Tokens', 'Estimated cost', 'Tools', 'Models', 'Context over time']

/** Stats computation, pricing and the cards load on demand (the chart inside loads later still). */
function LoadedStats(props: { session: Session; subagentSessions?: Session[] }) {
  const SessionStats = sessionStatsModule.use()
  return SessionStats ? createElement(SessionStats, props) : <PlaceholderCards />
}

function PlaceholderCards() {
  return PLACEHOLDER_CARDS.map((title) => (
    <StatCard key={title} title={title}>
      <Skeleton className="h-4 w-2/3 bg-hover" />
      <Skeleton className="h-4 w-1/2 bg-hover" />
      <Skeleton className="h-4 w-3/4 bg-hover" />
    </StatCard>
  ))
}

export interface StatsPanelProps {
  session?: Session
  /** Loaded subagent transcripts of `session` (enables the "Include subagents" switch). */
  subagentSessions?: Session[]
  /** Overrides the cards entirely. */
  children?: ReactNode
}

/** Below this width the panel slides over the chat as a sheet instead of taking a column. */
export const STATS_OVERLAY_QUERY = '(max-width: 1023px)'

/**
 * Right-hand session statistics panel (320px, collapsible). Skeleton cards until a session is open.
 * Under 1024px it is a right-side sheet over the chat (backdrop, Escape and outside click close it).
 */
export function StatsPanel({ session, subagentSessions, children }: StatsPanelProps) {
  const open = useUiStore((s) => s.statsPanelOpen)
  const setOpen = useUiStore((s) => s.setStatsPanelOpen)
  const overlay = useMediaQuery(STATS_OVERLAY_QUERY)
  const body = (
    <ScrollArea className="min-h-0 flex-1">
      <div className="flex flex-col gap-3 p-4">
        {children ??
          (session ? (
            <LoadedStats session={session} subagentSessions={subagentSessions} />
          ) : (
            <PlaceholderCards />
          ))}
      </div>
    </ScrollArea>
  )

  if (overlay) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="gap-0 bg-sidebar p-0 data-[side=right]:w-stats data-[side=right]:max-w-[calc(100vw-2.5rem)]"
        >
          <div className="flex h-16 shrink-0 items-center justify-between border-b px-4">
            <SheetTitle className="text-sm font-medium text-fg">Session stats</SheetTitle>
            <SheetDescription className="sr-only">
              Tokens, cost, tools and models of this session
            </SheetDescription>
            <IconButton label="Close stats" onClick={() => setOpen(false)}>
              <X />
            </IconButton>
          </div>
          {body}
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <aside
      aria-label="Session stats"
      aria-hidden={!open}
      inert={!open}
      className={cn(
        'h-full shrink-0 overflow-hidden bg-sidebar transition-[width] duration-150 ease-out',
        open ? 'w-stats border-l' : 'w-0',
      )}
    >
      <div className="flex h-full w-stats flex-col">
        <div className="flex h-16 shrink-0 items-center justify-between border-b px-4">
          <h2 className="text-sm font-medium text-fg">Session stats</h2>
          <IconButton label="Close stats" onClick={() => setOpen(false)}>
            <X />
          </IconButton>
        </div>
        {body}
      </div>
    </aside>
  )
}

export { StatCard }
