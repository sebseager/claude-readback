import { memo, type ReactNode } from 'react'
import { elapsedMs, formatDateTime, formatDuration, formatTokens } from '@/components/common/format'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { AssistantItem } from '@/lib/transcript/types'
import { highlightText } from '@/components/common/highlight'
import { useActiveOccurrence, useSearchQuery } from './chatStore'
import { RawJsonButton } from './RawJsonButton'

const NORMAL_STOPS = new Set(['end_turn', 'tool_use'])

/** `model · effort · in 12.4k · cache 180k · out 812`, abnormal stop reasons and API errors. */
export const AssistantFooter = memo(function AssistantFooter({ item }: { item: AssistantItem }) {
  const query = useSearchQuery()
  const errorActive = useActiveOccurrence(item.id, undefined, 'event')
  const u = item.usage
  const cache = u.cacheReadTokens + u.cacheWriteTokens
  const hasTokens = u.inputTokens + cache + u.outputTokens > 0
  const took = elapsedMs(item.startedAt, item.endedAt)
  const model = item.model === '<synthetic>' ? 'synthetic' : item.model
  return (
    <div
      className="flex min-h-6 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-fg-muted"
      data-testid="assistant-footer"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-default font-mono text-[11.5px]" tabIndex={0}>
            {model}
            {item.requestedModel && item.requestedModel !== item.model
              ? ` (asked ${item.requestedModel})`
              : ''}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="flex-col items-start gap-0.5 font-mono text-[11px]">
          <span>message {item.id}</span>
          {item.requestId && <span>request {item.requestId}</span>}
          <span>
            {formatDateTime(item.startedAt)}
            {item.endedAt !== item.startedAt ? ` → ${formatDateTime(item.endedAt)}` : ''}
          </span>
          {took !== undefined && took > 0 && <span>streamed over {formatDuration(took)}</span>}
        </TooltipContent>
      </Tooltip>
      {item.agent && <Sep>{item.agent}</Sep>}
      {item.effort && <Sep>{item.effort}</Sep>}
      {hasTokens && (
        <Sep>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-default tabular-nums" tabIndex={0}>
                in {formatTokens(u.inputTokens)} · cache {formatTokens(cache)} · out {u.final ? '' : '≥'}
                {formatTokens(u.outputTokens)}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="flex-col items-start gap-0.5 text-[11px]">
              <span>Input {u.inputTokens.toLocaleString()}</span>
              <span>Cache read {u.cacheReadTokens.toLocaleString()}</span>
              <span>Cache write {u.cacheWriteTokens.toLocaleString()}</span>
              <span>Output {u.outputTokens.toLocaleString()}</span>
              {!u.final && (
                <span className="max-w-60 pt-1 opacity-80">
                  No record of this response carried a stop reason, so the output count is a lower bound.
                </span>
              )}
            </TooltipContent>
          </Tooltip>
        </Sep>
      )}
      {item.stopReason && !NORMAL_STOPS.has(item.stopReason) && (
        <Sep>
          <span className="text-accent-hover dark:text-accent">stopped: {item.stopReason}</span>
        </Sep>
      )}
      {item.cacheMiss && (
        <Sep>
          <span title="The prompt cache missed for this request">
            cache miss: {item.cacheMiss.replace(/_/g, ' ')}
          </span>
        </Sep>
      )}
      {item.aborted && (
        <Sep>
          <span className="text-accent-hover dark:text-accent">cut off mid-stream</span>
        </Sep>
      )}
      {item.error && (
        <Sep>
          <span className="text-danger">
            API error{item.error.status ? ` ${item.error.status}` : ''}:{' '}
            {highlightText(item.error.text, query, errorActive)}
          </span>
        </Sep>
      )}
      <RawJsonButton lines={item.recordLines} title="Raw assistant records" className="ml-0.5" />
    </div>
  )
})

function Sep({ children }: { children: ReactNode }) {
  return (
    <>
      <span aria-hidden className="text-fg-muted/60">
        ·
      </span>
      {children}
    </>
  )
}
