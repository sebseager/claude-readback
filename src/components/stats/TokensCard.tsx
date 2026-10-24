import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatInteger, formatPercent, formatTokens } from '@/lib/format'
import type { Usage } from '@/lib/transcript/types'
import { TOKEN_SERIES } from './palette'
import { StatCard } from './StatCard'

const LOWER_BOUND_HINT =
  'Some messages have no final usage record (streaming was cut off), so output is a lower bound.'

export function TokensCard({ tokens, cacheHitRate }: { tokens: Usage; cacheHitRate?: number }) {
  const total = TOKEN_SERIES.reduce((n, s) => n + tokens[s.key], 0)
  const lowerBound = !tokens.final
  const prefix = (key: string) => (lowerBound && key === 'outputTokens' ? '≥' : '')

  return (
    <StatCard
      title="Tokens"
      action={
        <span className="text-xs text-fg-secondary tabular-nums">
          {lowerBound ? '≥' : ''}
          {formatTokens(total)}
        </span>
      }
    >
      {total > 0 ? (
        <div
          role="img"
          aria-label={TOKEN_SERIES.map((s) => `${s.label} ${formatInteger(tokens[s.key])}`).join(', ')}
          className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-[4px]"
        >
          {TOKEN_SERIES.filter((s) => tokens[s.key] > 0).map((s) => (
            <Tooltip key={s.key}>
              <TooltipTrigger asChild>
                <div
                  className="h-full min-w-[3px] transition-opacity hover:opacity-80"
                  style={{ flexGrow: tokens[s.key], flexBasis: 0, background: s.color }}
                />
              </TooltipTrigger>
              <TooltipContent side="top">
                <span className="font-semibold tabular-nums">
                  {prefix(s.key)}
                  {formatInteger(tokens[s.key])}
                </span>
                <span className="opacity-80">
                  {s.label} · {formatPercent(tokens[s.key] / total)}
                </span>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      ) : (
        <p className="text-xs text-fg-muted">No token usage recorded.</p>
      )}
      <ul className="mt-1 flex flex-col gap-1">
        {TOKEN_SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-2 text-xs">
            <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} />
            <span className="text-fg-secondary" title={s.hint}>
              {s.label}
            </span>
            <span className="ml-auto text-fg tabular-nums">
              {lowerBound && s.key === 'outputTokens' ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0} className="cursor-help underline decoration-dotted underline-offset-2">
                      ≥{formatTokens(tokens[s.key])}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="left">{LOWER_BOUND_HINT}</TooltipContent>
                </Tooltip>
              ) : (
                <span title={formatInteger(tokens[s.key])}>{formatTokens(tokens[s.key])}</span>
              )}
            </span>
            <span className="w-9 text-right text-fg-muted tabular-nums">
              {total > 0 ? formatPercent(tokens[s.key] / total) : '–'}
            </span>
          </li>
        ))}
      </ul>
      {cacheHitRate !== undefined && (
        <p className="border-t border-border pt-2 text-xs text-fg-secondary">
          Cache hit rate{' '}
          <span className="font-medium text-fg tabular-nums">{formatPercent(cacheHitRate)}</span>
          <span className="text-fg-muted"> of prompt tokens</span>
        </p>
      )}
    </StatCard>
  )
}
