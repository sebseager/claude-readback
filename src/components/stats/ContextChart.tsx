import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatInteger, formatTokens, shortModelName } from '@/lib/format'
import type { CompactionMark, ContextPoint } from '@/lib/stats'
import { PRIMARY } from './palette'
import { StatCard } from './StatCard'

const HEIGHT = 140
const TICK = { fontSize: 11, fill: 'var(--fg-muted)' } as const

function ChartTooltip({
  active,
  payload,
  describeTurn,
}: {
  active?: boolean
  payload?: ReadonlyArray<{ payload?: unknown }>
  describeTurn: (turnIndex: number) => string
}) {
  const p = payload?.[0]?.payload as ContextPoint | undefined
  if (!active || !p) return null
  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-fg shadow-md">
      <div className="flex items-center gap-1.5">
        <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: PRIMARY }} />
        <span className="font-semibold tabular-nums">{formatInteger(p.contextTokens)}</span>
        <span className="text-fg-muted">context</span>
      </div>
      <div className="mt-0.5 text-fg-secondary">
        #{p.index} · {shortModelName(p.model)} · {describeTurn(p.turnIndex)}
      </div>
      <div className="text-fg-muted tabular-nums">{formatInteger(p.output)} output</div>
    </div>
  )
}

export function ContextChart({
  series,
  marks,
  describeTurn,
}: {
  series: ContextPoint[]
  marks: CompactionMark[]
  describeTurn: (turnIndex: number) => string
}) {
  if (series.length === 0) {
    return (
      <StatCard title="Context over time">
        <p className="text-xs text-fg-muted">No API messages with usage.</p>
      </StatCard>
    )
  }
  let peak = series[0]
  for (const p of series) if (p.contextTokens > peak.contextTokens) peak = p
  const last = series[series.length - 1]
  const markIndices = marks.filter((m) => m.index !== undefined)
  const summary =
    `Context size per API message, ${series.length} messages. Peak ${formatTokens(peak.contextTokens)} at message ` +
    `${peak.index}, last ${formatTokens(last.contextTokens)}.` +
    (markIndices.length ? ` ${markIndices.length} compaction${markIndices.length === 1 ? '' : 's'}.` : '')

  return (
    <StatCard title="Context over time">
      <figure className="m-0" aria-label={summary}>
        <div style={{ height: HEIGHT }} className="-ml-1">
          <ResponsiveContainer width="100%" height={HEIGHT} initialDimension={{ width: 286, height: HEIGHT }}>
            <AreaChart data={series} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="index"
                type="number"
                domain={[1, 'dataMax']}
                allowDecimals={false}
                tick={TICK}
                tickLine={false}
                axisLine={{ stroke: 'var(--border)' }}
                tickCount={5}
                height={20}
              />
              <YAxis
                width={38}
                tick={TICK}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => formatTokens(v)}
                tickCount={4}
              />
              {markIndices.map((m) => (
                <ReferenceLine
                  key={`${m.source}-${m.index}`}
                  x={m.index! - 0.5}
                  stroke="var(--fg-muted)"
                  strokeOpacity={0.7}
                  ifOverflow="extendDomain"
                />
              ))}
              <Tooltip
                cursor={{ stroke: 'var(--fg-muted)', strokeWidth: 1 }}
                isAnimationActive={false}
                content={(props) => (
                  <ChartTooltip active={props.active} payload={props.payload} describeTurn={describeTurn} />
                )}
              />
              <Area
                type="linear"
                dataKey="contextTokens"
                name="Context"
                stroke={PRIMARY}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                fill={PRIMARY}
                fillOpacity={0.1}
                dot={false}
                activeDot={{ r: 4, fill: PRIMARY, stroke: 'var(--bg-main)', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <figcaption className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-muted">
          <span>
            Peak <span className="text-fg tabular-nums">{formatTokens(peak.contextTokens)}</span> at #
            {peak.index}
          </span>
          <span>
            Last <span className="text-fg tabular-nums">{formatTokens(last.contextTokens)}</span>
          </span>
          {markIndices.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <span aria-hidden className="h-3 w-px bg-fg-muted" />
              compaction{markIndices.length === 1 ? '' : `s (${markIndices.length})`}
            </span>
          )}
        </figcaption>
      </figure>
    </StatCard>
  )
}
