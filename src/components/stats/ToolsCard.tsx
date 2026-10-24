import { CircleAlert } from 'lucide-react'
import { useState } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatDuration } from '@/lib/format'
import type { ToolStat } from '@/lib/stats'
import { PRIMARY } from './palette'
import { StatCard } from './StatCard'

const TOP = 8

export function ToolsCard({ tools }: { tools: ToolStat[] }) {
  const [showAll, setShowAll] = useState(false)
  const max = tools[0]?.count ?? 0
  const shown = showAll ? tools : tools.slice(0, TOP)
  const total = tools.reduce((n, t) => n + t.count, 0)

  return (
    <StatCard
      title="Tools"
      action={total > 0 && <span className="text-xs text-fg-secondary tabular-nums">{total} calls</span>}
    >
      {tools.length === 0 ? (
        <p className="text-xs text-fg-muted">No tool calls.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {shown.map((t) => (
            <li key={t.name}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    tabIndex={0}
                    className="group -mx-1 grid grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-2 rounded-md px-1 py-0.5 text-xs outline-none hover:bg-hover focus-visible:bg-hover"
                  >
                    <span className="flex min-w-0 items-center gap-1">
                      <span className="truncate text-fg-secondary">{t.name}</span>
                      {t.errors > 0 && (
                        <span
                          className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-danger/10 px-1.5 text-[10px] leading-4 font-medium text-danger"
                          aria-label={`${t.errors} failed`}
                        >
                          <CircleAlert aria-hidden className="size-2.5" />
                          {t.errors}
                        </span>
                      )}
                    </span>
                    <span className="h-1.5 w-full">
                      <span
                        className="block h-full rounded-r-[4px]"
                        style={{ width: `${Math.max(2, (t.count / max) * 100)}%`, background: PRIMARY }}
                      />
                    </span>
                    <span className="w-6 text-right text-fg tabular-nums">{t.count}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="left">
                  <span className="font-semibold tabular-nums">{t.count}</span>
                  <span className="opacity-80">
                    {t.name}
                    {t.errors > 0 && ` · ${t.errors} failed`}
                    {t.totalMs !== undefined && ` · ${formatDuration(t.totalMs)} total`}
                  </span>
                </TooltipContent>
              </Tooltip>
            </li>
          ))}
        </ul>
      )}
      {tools.length > TOP && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="self-start rounded-md text-xs text-fg-secondary underline-offset-2 hover:text-fg hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {showAll ? 'Show top 8' : `Show all ${tools.length}`}
        </button>
      )}
    </StatCard>
  )
}
