import { ChevronRight, Paperclip, Stethoscope, Webhook } from 'lucide-react'
import { createElement, memo } from 'react'
import { highlightText, splitActive } from '@/components/common/highlight'
import type { ToolAttachment } from '@/lib/transcript/types'
import { cn } from '@/lib/utils'
import { useActiveOccurrence, useExpanded, useRevealWhenActive, useSearchQuery } from '../chatStore'
import { CHIP } from '../chipStyles'
import { ClampedText } from './ClampedText'

const iconFor = (type: string) =>
  type.includes('diagnostic') ? Stethoscope : type.startsWith('hook') ? Webhook : Paperclip

/** Attachment chips under a tool result (diagnostics, hook output, truncation notices). */
export const ToolAttachments = memo(function ToolAttachments({
  blockId,
  attachments,
}: {
  /** The tool block: attachments are indexed as its `context` texts (label, then text, per chip). */
  blockId: string
  attachments: ToolAttachment[]
}) {
  const query = useSearchQuery()
  const active = useActiveOccurrence(blockId, blockId, 'context')
  if (attachments.length === 0) return null
  const split = splitActive(
    attachments.flatMap((a) => [a.label, a.text]),
    query,
    active,
  )
  return (
    <div className="flex flex-col gap-1.5" data-testid="tool-attachments">
      {attachments.map((a, i) => (
        <AttachmentChip
          key={a.id}
          attachment={a}
          query={query}
          labelActive={split[2 * i]}
          textActive={split[2 * i + 1]}
        />
      ))}
    </div>
  )
})

function AttachmentChip({
  attachment: a,
  query,
  labelActive,
  textActive,
}: {
  attachment: ToolAttachment
  query: string
  labelActive?: number
  textActive?: number
}) {
  const [open, toggle] = useExpanded(a.id, false)
  useRevealWhenActive(a.id, textActive)
  const warn = a.type.includes('diagnostic') || a.type.includes('error')
  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={toggle}
        className={cn(CHIP, 'h-6 text-[12px]', warn && 'border-accent/35 text-accent-hover dark:text-accent')}
      >
        {createElement(iconFor(a.type))}
        <span className="truncate">{highlightText(a.label, query, labelActive)}</span>
        <ChevronRight className={cn('transition-transform duration-150', open && 'rotate-90')} />
      </button>
      {open && (
        <div className="w-full">
          <ClampedText id={a.id} text={a.text} title={a.label} tone="muted" activeIndex={textActive} />
        </div>
      )}
    </div>
  )
}
