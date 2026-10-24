import { formatUsd, shortModelName } from '@/lib/format'
import type { CostStats } from '@/lib/stats'
import { StatCard } from './StatCard'

export function CostCard({ cost, includedSubagents }: { cost: CostStats; includedSubagents: number }) {
  const fromState = cost.source === 'cost-state'
  const caption = fromState
    ? 'from Claude Code cost-state'
    : cost.source === 'estimate'
      ? `estimate from list prices${includedSubagents > 0 ? ' · incl. subagents' : ''}`
      : 'no priced models'
  return (
    <StatCard title={fromState ? 'Cost' : 'Estimated cost'}>
      <div>
        <div className="text-[28px] leading-8 font-semibold text-fg">
          {cost.totalUsd !== undefined ? formatUsd(cost.totalUsd) : '–'}
        </div>
        <p className="mt-0.5 text-[11px] text-fg-muted">{caption}</p>
        {fromState && includedSubagents > 0 && (
          <p className="text-[11px] text-fg-muted">Already includes subagent usage.</p>
        )}
      </div>
      {cost.byModel.length > 0 && (
        <ul className="flex flex-col gap-1 border-t border-border pt-2">
          {cost.byModel.map((m) => (
            <li key={m.model} className="flex items-baseline gap-2 text-xs">
              <span className="truncate text-fg-secondary" title={m.model}>
                {shortModelName(m.model)}
              </span>
              {m.source === 'estimate' && fromState && (
                <span className="text-[11px] text-fg-muted">est.</span>
              )}
              <span className="ml-auto text-fg tabular-nums">
                {m.usd !== undefined ? formatUsd(m.usd) : '–'}
              </span>
            </li>
          ))}
        </ul>
      )}
      {cost.unpricedModels.length > 0 && (
        <p className="text-[11px] text-fg-muted">
          No price for {cost.unpricedModels.map(shortModelName).join(', ')}; not included.
        </p>
      )}
    </StatCard>
  )
}
