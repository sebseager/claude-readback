import { formatDuration } from '@/lib/format'
import type { StatsTotals } from '@/lib/stats'
import { StatCard } from './StatCard'

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-sidebar/60 px-3 py-2">
      <div className="truncate text-[18px] leading-6 font-semibold text-fg tabular-nums">{value}</div>
      {/* Labels wrap rather than truncate: the 320px panel leaves ~120px per tile. */}
      <div className="text-[11px] leading-4 break-words text-fg-muted">{label}</div>
      {sub && <div className="text-[11px] leading-4 break-words text-fg-secondary">{sub}</div>}
    </div>
  )
}

export function TotalsCard({ totals }: { totals: StatsTotals }) {
  const t = totals
  const subagentsSub =
    t.subagents > 0 && t.subagentsUploaded < t.subagents
      ? `${t.subagentsUploaded}/${t.subagents} loaded`
      : undefined
  const extras = [
    t.interrupts > 0 && `${t.interrupts} interrupt${t.interrupts === 1 ? '' : 's'}`,
    t.compactions > 0 && `${t.compactions} compaction${t.compactions === 1 ? '' : 's'}`,
  ].filter(Boolean)
  return (
    <StatCard title="Totals">
      <div className="grid grid-cols-2 gap-2">
        <Tile label="Turns" value={String(t.turns)} />
        <Tile label="Messages" value={String(t.assistantMessages)} />
        <Tile
          label="Tool calls"
          value={String(t.toolCalls)}
          sub={t.toolErrors > 0 ? `${t.toolErrors} failed` : undefined}
        />
        <Tile label="Subagents" value={String(t.subagents)} sub={subagentsSub} />
        <Tile
          label="Duration"
          value={formatDuration(t.wallMs)}
          sub={t.activeMs !== undefined ? `${formatDuration(t.activeMs)} active` : undefined}
        />
        <Tile label="Thinking" value={formatDuration(t.thinkingMs)} />
      </div>
      {extras.length > 0 && <p className="text-[11px] text-fg-muted">{extras.join(' · ')}</p>}
    </StatCard>
  )
}
