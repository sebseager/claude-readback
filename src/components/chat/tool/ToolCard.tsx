import { ChevronRight } from 'lucide-react'
import { createElement, memo } from 'react'
import { elapsedMs, formatDuration } from '@/components/common/format'
import { highlightText } from '@/components/common/highlight'
import { bashOutput, toolResultText } from '@/lib/transcript/searchText'
import type { ToolBlock } from '@/lib/transcript/types'
import { stripAnsi } from '@/lib/transcript/util'
import { cn } from '@/lib/utils'
import { useActiveOccurrence, useExpanded, useSearchQuery } from '../chatStore'
import { RawJsonButton } from '../RawJsonButton'
import { useToolInputActive } from './partsActive'
import { toolCardBody } from './toolCardBodyLoader'
import { ToolStatusBadge } from './ToolStatusBadge'
import { displayToolName, toolIcon, toolStatus, type ToolStatus } from './toolMeta'

/** When the result fully restates the input (answers, new todo list), the Input section is skipped. */
const RESULT_SUPERSEDES_INPUT = new Set(['AskUserQuestion', 'TodoWrite'])

type Props = {
  block: ToolBlock
  /** Raw lines to show when the block has no result record of its own (the assistant group's lines). */
  fallbackLines?: number[]
}

/** A tool call: one-line header (icon, name, summary, status, duration) expanding to Input + Result. */
export const ToolCard = memo(function ToolCard({ block, fallbackLines }: Props) {
  const status = toolStatus(block)
  // Every card starts collapsed, errors and denials included (they keep the red border), so a session scrolls fast.
  const [open, toggle] = useExpanded(block.id)
  const query = useSearchQuery()
  const duration = elapsedMs(block.startedAt, block.endedAt)
  const inputActive = useToolInputActive(block)
  const inputHit = useActiveOccurrence(block.id, block.id, 'tool-input') !== undefined
  // Shown anyway while a search hit points inside the input.
  const skipInput =
    !inputHit &&
    RESULT_SUPERSEDES_INPUT.has(block.name) &&
    block.result &&
    !block.result.isError &&
    block.result.structured !== undefined
  const name = displayToolName(block.name)
  const rawLines = toolRawLines(block, fallbackLines)
  const preview = open ? undefined : commandPreview(block)
  const failure = open ? undefined : failurePreview(block, status)
  return (
    <div
      className={cn(
        'group/tool rounded-xl border bg-sidebar/60 transition-colors duration-150',
        status === 'error' || status === 'denied' ? 'border-danger/25' : 'border-border',
      )}
      data-testid="tool-card"
      data-tool={block.name}
      data-status={status}
    >
      <div className="flex items-center pr-1.5">
        <button
          type="button"
          aria-expanded={open}
          onClick={toggle}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl py-2 pr-1.5 pl-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {createElement(toolIcon(block.name), { className: 'size-4 shrink-0 text-fg-secondary' })}
          <span className="shrink-0 text-[13.5px] font-semibold text-fg">
            {highlightText(name, query, inputActive('name'))}
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-fg-muted">
            {highlightText(block.summary, query)}
          </span>
          <span className="flex shrink-0 items-center gap-2 text-[11.5px]">
            <ToolStatusBadge status={status} />
            {duration !== undefined && (
              <span className="text-fg-muted tabular-nums">{formatDuration(duration)}</span>
            )}
            <ChevronRight
              className={cn('size-4 text-fg-muted transition-transform duration-150', open && 'rotate-90')}
            />
          </span>
        </button>
        <RawJsonButton lines={rawLines} group="tool" title={`${block.name} tool call`} />
      </div>
      {preview && (
        <div
          className="-mt-1 truncate px-3 pb-2 font-mono text-[12px] text-fg-muted"
          data-testid="tool-preview"
        >
          <span className="select-none text-fg-muted/60">$ </span>
          {highlightText(preview, query)}
        </div>
      )}
      {failure && (
        <div
          className="truncate rounded-b-[11px] border-t border-danger/25 bg-danger/8 px-3 py-1.5 font-mono text-[12px] text-danger"
          data-testid="tool-failure"
        >
          {highlightText(failure, query)}
        </div>
      )}
      {open && <ToolCardBodySlot block={block} skipInput={!!skipInput} />}
    </div>
  )
})

const clip = (line: string | undefined) => (line && line.length > 240 ? `${line.slice(0, 240)} …` : line)

const nonEmptyLines = (text: string | undefined): string[] =>
  text
    ? stripAnsi(text)
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
    : []

const firstLine = (text: string | undefined) => clip(nonEmptyLines(text)[0])
/** Shell output ends with the summary ("error: …", "Tests 1 failed"), so the last line says the most. */
const lastLine = (text: string | undefined) => clip(nonEmptyLines(text).at(-1))

/** One line on why a failed call failed: the denial reason, else the first line of what the tool said. */
function failurePreview(block: ToolBlock, status: ToolStatus): string | undefined {
  const r = block.result
  if (!r) return undefined
  if (status === 'denied') return firstLine(r.denied) ?? 'Denied'
  if (status !== 'error') return undefined
  if (block.name === 'Bash') {
    const { stdout, stderr, exitCode } = bashOutput(r)
    const line = lastLine(stderr) ?? lastLine(stdout)
    if (line) return exitCode !== undefined ? `exit ${exitCode} · ${line}` : line
    if (exitCode !== undefined) return `exit ${exitCode}`
  }
  return firstLine(toolResultText(r)) ?? 'Error'
}

/**
 * First line of a shell command (Bash and friends) for the collapsed card, so the header's description
 * is backed by what actually ran. Undefined when the summary already is the command.
 */
function commandPreview(block: ToolBlock): string | undefined {
  const input = block.input
  if (!input || typeof input !== 'object') return undefined
  const command = (input as Record<string, unknown>).command
  if (typeof command !== 'string') return undefined
  const lines = command.trim().split('\n')
  const first = lines[0].trim()
  if (!first) return undefined
  const preview = lines.length > 1 ? `${first} …` : first
  return preview === block.summary ? undefined : preview
}

/** Input + Result sections, loaded with the tool renderers' chunk (preloaded on app start). */
function ToolCardBodySlot({ block, skipInput }: { block: ToolBlock; skipInput: boolean }) {
  const Body = toolCardBody.use()
  if (Body) return createElement(Body, { block, skipInput })
  return (
    <div className="flex flex-col gap-2 border-t border-border px-3 pt-2.5 pb-3" aria-busy>
      <div className="h-3 w-16 animate-pulse rounded bg-hover" />
      <div className="h-12 w-full animate-pulse rounded-lg bg-hover" />
    </div>
  )
}

/** The tool_use record, the tool_result record and linked attachments (deduplicated, file order). */
function toolRawLines(block: ToolBlock, fallbackLines?: number[]): number[] {
  const lines: number[] = []
  if (block.recordLine !== undefined) lines.push(block.recordLine)
  if (block.result) lines.push(block.result.recordLine)
  for (const a of block.attachments) lines.push(a.recordLine)
  if (lines.length === 0) return fallbackLines ?? []
  return [...new Set(lines)].sort((a, b) => a - b)
}
