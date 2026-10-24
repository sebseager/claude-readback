import { formatInteger, formatTokens, shortModelName } from '@/lib/format'
import type { ModelStat } from '@/lib/stats'
import { StatCard } from './StatCard'

const total = (m: ModelStat) =>
  m.tokens.inputTokens + m.tokens.cacheReadTokens + m.tokens.cacheWriteTokens + m.tokens.outputTokens

export function ModelsCard({ models }: { models: ModelStat[] }) {
  return (
    <StatCard title="Models">
      {models.length === 0 ? (
        <p className="text-xs text-fg-muted">No model responses.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {models.map((m) => (
            <li key={m.model} className="flex items-baseline gap-2 text-xs">
              <span className="truncate font-medium text-fg" title={m.model}>
                {shortModelName(m.model)}
              </span>
              <span className="ml-auto shrink-0 text-fg-secondary tabular-nums">
                {m.messages} msg{m.messages === 1 ? '' : 's'}
              </span>
              <span
                className="w-14 shrink-0 text-right text-fg tabular-nums"
                title={`${formatInteger(total(m))} tokens (${formatInteger(m.tokens.outputTokens)} output)`}
              >
                {m.tokens.final ? '' : '≥'}
                {formatTokens(total(m))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </StatCard>
  )
}
