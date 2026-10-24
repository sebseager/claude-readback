import { ChevronRight } from 'lucide-react'
import { createElement, memo } from 'react'
import { elapsedMs, formatDuration } from '@/components/common/format'
import { highlightText } from '@/components/common/highlight'
import type { ToolBlock } from '@/lib/transcript/types'
import { cn } from '@/lib/utils'
import { useActiveOccurrence, useExpanded, useSearchQuery } from '../chatStore'
import { RawJsonButton } from '../RawJsonButton'
import { useToolInputActive } from './partsActive'
import { toolCardBody } from './toolCardBodyLoader'
import { ToolStatusBadge } from './ToolStatusBadge'
import { displayToolName, toolIcon, toolStatus } from './toolMeta'

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
  const defaultOpen = status === 'error' || status === 'denied'
  const [open, toggle] = useExpanded(block.id, defaultOpen)
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
      {open && <ToolCardBodySlot block={block} skipInput={!!skipInput} />}
    </div>
  )
})

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
