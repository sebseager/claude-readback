import { formatDuration, formatShortDateTime } from '@/lib/format'
import type { TurnGapStats } from '@/lib/stats'
import { StatCard } from './StatCard'

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline gap-2 text-xs">
      <dt className="text-fg-secondary">{label}</dt>
      <dd className="m-0 ml-auto text-right text-fg tabular-nums">
        {value}
        {hint && <span className="text-fg-muted"> · {hint}</span>}
      </dd>
    </div>
  )
}

export function PaceCard({
  gaps,
  startedAt,
  endedAt,
  describeTurn,
}: {
  gaps?: TurnGapStats
  startedAt?: string
  endedAt?: string
  describeTurn: (turnIndex: number) => string
}) {
  return (
    <StatCard title="Pace">
      <dl className="m-0 flex flex-col gap-1">
        {gaps ? (
          <>
            <Row label="Median gap between turns" value={formatDuration(gaps.medianMs)} />
            <Row label="p90 gap" value={formatDuration(gaps.p90Ms)} />
            <Row
              label="Longest gap"
              value={formatDuration(gaps.longest.ms)}
              hint={`before ${describeTurn(gaps.longest.turnIndex)}`}
            />
          </>
        ) : (
          <p className="text-xs text-fg-muted">Only one turn, no gaps to measure.</p>
        )}
        {startedAt && <Row label="Started" value={formatShortDateTime(startedAt)} />}
        {endedAt && <Row label="Ended" value={formatShortDateTime(endedAt)} />}
      </dl>
    </StatCard>
  )
}
