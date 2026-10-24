import { FileText } from 'lucide-react'
import { memo } from 'react'
import type { Mention, PromptSegment } from '@/lib/transcript/types'
import { cn } from '@/lib/utils'
import { CHIP_STATIC } from './chipStyles'
import { ImageChip } from './ImageChip'
import { MentionPill } from './MentionPill'
import { PastedTextChip } from './PastedTextChip'
import { SystemReminderChip } from './SystemReminderChip'

type Props = {
  segments: PromptSegment[]
  mentions: Mention[]
  /** Row the prompt renders in; scopes search hits inside chips. */
  rowId?: string
  className?: string
  /** Segment kinds rendered elsewhere (pasted blocks go inline in the bubble). */
  omit?: readonly PromptSegment['kind'][]
}

/** Everything attached to a prompt that isn't prose: pasted blocks, images, documents, mentions, reminders. */
export const AttachmentChips = memo(function AttachmentChips({
  segments,
  mentions,
  rowId,
  className,
  omit,
}: Props) {
  const images = segments.filter((s) => s.kind === 'image')
  // Keep each segment's index: search block ids (`sr:<i>`) are positions in `segments`.
  const others = segments.flatMap((s, i) =>
    s.kind !== 'text' && s.kind !== 'image' && !omit?.includes(s.kind) ? [{ s, i }] : [],
  )
  if (images.length === 0 && others.length === 0 && mentions.length === 0) return null
  return (
    <div className={cn('flex max-w-[80%] flex-col items-end gap-1.5', className)}>
      {images.length > 0 && (
        <div className="flex flex-wrap justify-end gap-1.5">
          {images.map((s, i) => (
            <ImageChip key={i} mediaType={s.mediaType} base64={s.base64} alt={`Image ${i + 1}`} />
          ))}
        </div>
      )}
      {(others.length > 0 || mentions.length > 0) && (
        <div className="flex flex-wrap justify-end gap-1.5">
          {others.map(({ s, i }) => {
            switch (s.kind) {
              case 'pasted':
                return (
                  <PastedTextChip key={s.id} rowId={rowId} index={s.index} lines={s.lines} text={s.text} />
                )
              case 'document':
                return (
                  <span key={`doc-${i}`} className={CHIP_STATIC} title={s.mediaType}>
                    <FileText />
                    <span className="truncate">{s.name ?? s.mediaType}</span>
                  </span>
                )
              case 'system-reminder':
                return <SystemReminderChip key={`sr-${i}`} text={s.text} rowId={rowId} blockId={`sr:${i}`} />
              default:
                return null
            }
          })}
          {mentions.map((m, i) => (
            <MentionPill
              key={`${m.kind}:${m.path}:${i}`}
              mention={m}
              rowId={rowId}
              blockId={`mention:${i}`}
            />
          ))}
        </div>
      )}
    </div>
  )
})
