import { Bot, ChevronRight, ExternalLink, FileUp } from 'lucide-react'
import { memo, type ReactNode } from 'react'
import { formatDuration } from '@/components/common/format'
import { Button } from '@/components/ui/button'
import type { SubagentRef } from '@/lib/transcript/types'
import { cn } from '@/lib/utils'
import { useExpanded, useRevealWhenActive } from '../chatStore'
import { Markdown } from '../Markdown'
import { ClampedText } from './ClampedText'

type Props = {
  subagent: SubagentRef
  elapsedMs?: number
  /** Nested transcript renderer, plugged in by the integration layer. */
  renderTranscript?: (ref: SubagentRef) => ReactNode
  onOpen?: (ref: SubagentRef) => void
  defaultOpen?: boolean
  /** The Agent tool's own result text, shown when there is no handback (async launch notes…). */
  resultText?: string
  /** Search occurrence to ring in the handback (or result text); opens the card. */
  activeIndex?: number
}

const STATUS = {
  launched: { label: 'launched', cls: 'bg-bubble text-fg-secondary' },
  completed: { label: 'completed', cls: 'bg-success/12 text-success' },
  unknown: { label: 'unknown', cls: 'bg-bubble text-fg-muted' },
} as const

/** The subagent behind an Agent tool call: summary header, handback, nested transcript slot. */
export const SubagentCard = memo(function SubagentCard({
  subagent: s,
  elapsedMs,
  renderTranscript,
  onOpen,
  defaultOpen = false,
  resultText,
  activeIndex,
}: Props) {
  const [open, toggle] = useExpanded(`subagent:${s.agentId}`, defaultOpen)
  useRevealWhenActive(`subagent:${s.agentId}`, activeIndex)
  const status = STATUS[s.status]
  return (
    <div className="rounded-xl border border-border bg-main" data-testid="subagent-card">
      <button
        type="button"
        aria-expanded={open}
        onClick={toggle}
        className="flex w-full min-w-0 items-center gap-2.5 rounded-xl px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <Bot className="size-4 shrink-0 text-accent" />
        <span className="min-w-0 truncate text-[13.5px] font-medium text-fg">
          {s.description ?? s.agentType ?? `Agent ${s.agentId}`}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[11.5px]">
          {s.agentType && (
            <span className="rounded-full border border-border px-2 py-px text-fg-secondary">
              {s.agentType}
            </span>
          )}
          {s.model && (
            <span className="hidden rounded-full border border-border px-2 py-px font-mono text-fg-muted sm:inline">
              {s.model}
            </span>
          )}
          <span className={cn('rounded-full px-2 py-px', status.cls)}>{status.label}</span>
          {elapsedMs !== undefined && (
            <span className="text-fg-muted tabular-nums">{formatDuration(elapsedMs)}</span>
          )}
          <ChevronRight
            className={cn('size-4 text-fg-muted transition-transform duration-150', open && 'rotate-90')}
          />
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-border px-4 py-3">
          {s.handback ? (
            <div>
              <h4 className="mb-1 text-[11px] font-medium tracking-[0.06em] text-fg-muted uppercase">
                Handback
              </h4>
              <Markdown markdown={s.handback} className="text-[14px]" activeIndex={activeIndex} />
            </div>
          ) : resultText?.trim() ? (
            <ClampedText
              id={`subagent:${s.agentId}:result`}
              text={resultText}
              title="Agent tool result"
              tone="muted"
              activeIndex={activeIndex}
            />
          ) : (
            <p className="text-[13px] text-fg-muted italic">
              {s.status === 'launched'
                ? 'Running in the background; no handback recorded in this file.'
                : 'No handback recorded.'}
            </p>
          )}
          {s.fileKey ? (
            renderTranscript ? (
              <div className="border-l-2 border-border pl-4">{renderTranscript(s)}</div>
            ) : onOpen ? (
              <Button variant="outline" size="sm" className="self-start" onClick={() => onOpen(s)}>
                <ExternalLink />
                Open subagent transcript
              </Button>
            ) : null
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-[12.5px] text-fg-muted">
              <FileUp className="size-3.5 shrink-0" />
              <span>
                Transcript not uploaded — drop{' '}
                <code className="rounded bg-bubble px-1 py-px font-mono text-[11.5px] text-fg-secondary">
                  agent-{s.agentId}.jsonl
                </code>{' '}
                to attach it
              </span>
            </div>
          )}
          {s.fileKey && renderTranscript && onOpen && (
            <Button variant="ghost" size="xs" className="self-start text-fg-muted" onClick={() => onOpen(s)}>
              <ExternalLink />
              Open on its own
            </Button>
          )}
        </div>
      )}
    </div>
  )
})
