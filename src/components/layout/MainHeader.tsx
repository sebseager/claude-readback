import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Calendar,
  Clock,
  Cpu,
  Folder,
  GitBranch,
  PanelRightClose,
  PanelRightOpen,
  ShieldCheck,
  Tag,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useSessionStore } from '@/app/sessionStore'
import { useUiStore } from '@/app/store'
import { formatDuration } from '@/components/common/format'
import { IconButton } from '@/components/common/IconButton'
import { titleSourceLabel } from '@/components/sidebar/grouping'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { SessionSummary } from '@/lib/transcript/types'
import { cn } from '@/lib/utils'
import { formatStart, shortModels, versionLabel } from './sessionMeta'
import { SessionSearch } from './SessionSearch'

/** Session title, meta line, search bar and stats-panel toggle. */
export function MainHeader() {
  const statsPanelOpen = useUiStore((s) => s.statsPanelOpen)
  const toggleStatsPanel = useUiStore((s) => s.toggleStatsPanel)
  const session = useSessionStore((s) => s.activeSession)
  const loading = useSessionStore((s) => s.loading)
  const activeId = useSessionStore((s) => s.activeSessionId)
  const listed = useSessionStore((s) => s.sessions.find((x) => x.sessionId === s.activeSessionId))
  const summary = session?.summary ?? listed

  return (
    // Wide: one 64px row. Below md the search wraps onto its own full-width row under the title + meta.
    <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b bg-main px-3 py-2.5 sm:px-5 md:h-16 md:flex-nowrap md:gap-x-4 md:py-0">
      <div className="min-w-0 flex-1 md:min-w-[14rem]">
        {summary ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <h1 className="truncate font-serif text-[17px] leading-6 font-medium tracking-tight text-fg">
                {summary.title}
              </h1>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start" className="max-w-md">
              <p className="whitespace-pre-wrap">{summary.title}</p>
              <p className="mt-1 opacity-70">
                {titleSourceLabel(summary.titleSource)} · {summary.sessionId}
              </p>
            </TooltipContent>
          </Tooltip>
        ) : loading ? (
          <Skeleton className="my-1 h-4 w-64 max-w-full bg-hover" />
        ) : (
          <h1 className="truncate font-serif text-[17px] leading-6 font-medium tracking-tight text-fg-secondary">
            No session open
          </h1>
        )}
        {summary && <MetaLine summary={summary} />}
      </div>

      <SessionSearch
        sessionId={session ? activeId : null}
        className="order-last w-full md:order-none md:w-auto md:min-w-[13rem] md:flex-[0_1_20rem]"
      />
      <div className="mx-0.5 hidden h-5 w-px bg-border md:block" aria-hidden />
      <IconButton
        label={statsPanelOpen ? 'Hide session stats' : 'Show session stats'}
        aria-pressed={statsPanelOpen}
        onClick={toggleStatsPanel}
        className="shrink-0"
      >
        {statsPanelOpen ? <PanelRightClose /> : <PanelRightOpen />}
      </IconButton>
    </header>
  )
}

function MetaLine({ summary: s }: { summary: SessionSummary }) {
  const open = useSessionStore((st) => st.open)
  const stored = useSessionStore((st) => st.sessions)
  const has = (id?: string) => !!id && stored.some((x) => x.sessionId === id)
  const models = shortModels(s.models)
  const version = versionLabel(s.versions)
  const subagents = Math.max(s.subagentCount, s.subagentFilesPresent)

  // In priority order. Each separator travels with the item after it.
  const items: ReactNode[] = []
  if (s.continuedFromSessionId)
    items.push(
      <LinkItem
        key="from"
        icon={<ArrowLeft />}
        label="continued from"
        target={s.continuedFromSessionId}
        enabled={has(s.continuedFromSessionId)}
        onOpen={open}
      />,
    )
  items.push(
    <MetaItem key="cwd" icon={<Folder />} tip={s.cwd || undefined} truncate>
      {s.projectName || s.cwd || 'unknown project'}
    </MetaItem>,
  )
  if (s.gitBranch)
    items.push(
      <MetaItem key="branch" icon={<GitBranch />} tip={`Branch ${s.gitBranch}`} truncate>
        {s.gitBranch}
      </MetaItem>,
    )
  if (s.startedAt)
    items.push(
      <MetaItem
        key="date"
        icon={<Calendar />}
        tip={`Started ${s.startedAt}${s.endedAt ? ` · ended ${s.endedAt}` : ''}`}
      >
        {formatStart(s.startedAt)}
      </MetaItem>,
    )
  if (s.durationMs > 0)
    items.push(
      <MetaItem
        key="duration"
        icon={<Clock />}
        tip={
          s.activeMs !== undefined
            ? `Wall clock ${formatDuration(s.durationMs)} · Claude working ${formatDuration(s.activeMs)}`
            : `Wall clock ${formatDuration(s.durationMs)}`
        }
      >
        {formatDuration(s.durationMs)}
      </MetaItem>,
    )
  if (s.continuedInSessionId)
    items.push(
      <LinkItem
        key="in"
        icon={<ArrowRight />}
        label="continued in"
        target={s.continuedInSessionId}
        enabled={has(s.continuedInSessionId)}
        onOpen={open}
        trailing
      />,
    )
  if (models.length > 0)
    items.push(
      <MetaItem key="models" icon={<Cpu />} tip={s.models.join(', ')}>
        {models.length > 2 ? `${models.slice(0, 2).join(', ')} +${models.length - 2}` : models.join(', ')}
      </MetaItem>,
    )
  if (subagents > 0)
    items.push(
      <MetaItem
        key="subagents"
        icon={<Bot />}
        tip={`${s.subagentCount} subagent${s.subagentCount === 1 ? '' : 's'} launched · ${s.subagentFilesPresent} transcript${s.subagentFilesPresent === 1 ? '' : 's'} attached`}
      >
        {subagents} subagent{subagents === 1 ? '' : 's'}
      </MetaItem>,
    )
  if (s.permissionMode)
    items.push(
      <MetaItem key="perm" icon={<ShieldCheck />} tip="Permission mode">
        {s.permissionMode}
      </MetaItem>,
    )
  if (version)
    items.push(
      <MetaItem key="version" icon={<Tag />} tip={`Claude Code ${s.versions.join(', ')}`}>
        v{version}
      </MetaItem>,
    )

  return (
    // Fixed height + wrap + overflow-hidden: whatever does not fit drops out from the end (lowest priority).
    <div
      className="flex h-5 min-w-0 flex-wrap items-center overflow-hidden text-xs leading-5 whitespace-nowrap text-fg-muted"
      data-testid="session-meta"
    >
      {items.map((item, i) => (
        <span key={i} className={cn('flex h-5 min-w-0 items-center', i === 0 ? 'max-w-full' : 'max-w-[60%]')}>
          {i > 0 && (
            <span aria-hidden className="shrink-0 px-1.5 opacity-60">
              ·
            </span>
          )}
          {item}
        </span>
      ))}
    </div>
  )
}

function MetaItem({
  icon,
  children,
  tip,
  truncate,
}: {
  icon: ReactNode
  children: ReactNode
  tip?: string
  truncate?: boolean
}) {
  const body = (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1 [&_svg]:size-3 [&_svg]:shrink-0',
        truncate ? 'max-w-full min-w-0 shrink' : 'shrink-0',
      )}
    >
      {icon}
      <span className={cn(truncate && 'truncate')}>{children}</span>
    </span>
  )
  if (!tip) return body
  return (
    <Tooltip>
      <TooltipTrigger asChild>{body}</TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-md break-all">
        {tip}
      </TooltipContent>
    </Tooltip>
  )
}

function LinkItem({
  icon,
  label,
  target,
  enabled,
  onOpen,
  trailing,
}: {
  icon: ReactNode
  label: string
  target: string
  enabled: boolean
  onOpen: (id: string) => void
  trailing?: boolean
}) {
  const text = trailing ? (
    <>
      {label} {icon}
    </>
  ) : (
    <>
      {icon} {label}
    </>
  )
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          disabled={!enabled}
          onClick={() => onOpen(target)}
          className={cn(
            'inline-flex h-5 shrink-0 items-center gap-1 rounded [&_svg]:size-3',
            enabled ? 'text-accent hover:underline' : 'cursor-default opacity-80',
          )}
        >
          {text}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {enabled ? `Open ${target}` : `${target} is not in the library — drop its .jsonl to link it`}
      </TooltipContent>
    </Tooltip>
  )
}
