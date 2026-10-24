import { lazy, Suspense, useCallback, useId, useMemo, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { computeStats } from '@/lib/stats'
import type { Session } from '@/lib/transcript/types'
import { cn } from '@/lib/utils'
import { CostCard } from './CostCard'
import { describeTurn } from './labels'
import { ModelsCard } from './ModelsCard'
import { PaceCard } from './PaceCard'
import { StatCard } from './StatCard'
import { STATS_PALETTE_CLASS } from './palette'
import { TokensCard } from './TokensCard'
import { ToolsCard } from './ToolsCard'
import { TotalsCard } from './TotalsCard'

// recharts (with its d3/redux dependencies) is the single biggest library; it loads with the first chart.
const ContextChart = lazy(() => import('./ContextChart').then((m) => ({ default: m.ContextChart })))

function ChartSkeleton() {
  return (
    <StatCard title="Context over time">
      <Skeleton className="h-[140px] w-full bg-hover" data-testid="context-chart-loading" />
    </StatCard>
  )
}

export interface SessionStatsProps {
  session: Session
  /** Loaded subagent transcripts; enables the "Include subagents" switch (tokens, cost, tools, models). */
  subagentSessions?: Session[]
  className?: string
}

/** The stack of stats cards for one session. */
export function SessionStats({ session, subagentSessions, className }: SessionStatsProps) {
  const [includeSubagents, setIncludeSubagents] = useState(true)
  const hasSubagents = (subagentSessions?.length ?? 0) > 0
  const included = hasSubagents && includeSubagents ? subagentSessions : undefined
  const stats = useMemo(
    () => computeStats(session, included ? { includeSubagents: included } : undefined),
    [session, included],
  )
  const turnLabel = useCallback((i: number) => describeTurn(session, i), [session])
  const switchId = useId()

  return (
    <div className={cn('flex flex-col gap-3', STATS_PALETTE_CLASS, className)}>
      {hasSubagents && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-main px-4 py-2.5">
          <label htmlFor={switchId} className="text-xs text-fg-secondary">
            Include subagents <span className="text-fg-muted tabular-nums">({subagentSessions!.length})</span>
          </label>
          <Switch id={switchId} size="sm" checked={includeSubagents} onCheckedChange={setIncludeSubagents} />
        </div>
      )}
      <TotalsCard totals={stats.totals} />
      <TokensCard tokens={stats.tokens} cacheHitRate={stats.cacheHitRate} />
      <CostCard cost={stats.cost} includedSubagents={stats.includedSubagents} />
      <Suspense fallback={<ChartSkeleton />}>
        <ContextChart series={stats.contextSeries} marks={stats.compactionMarks} describeTurn={turnLabel} />
      </Suspense>
      <ToolsCard tools={stats.tools} />
      <ModelsCard models={stats.models} />
      <PaceCard
        gaps={stats.turnGaps}
        startedAt={stats.startedAt}
        endedAt={stats.endedAt}
        describeTurn={turnLabel}
      />
    </div>
  )
}
