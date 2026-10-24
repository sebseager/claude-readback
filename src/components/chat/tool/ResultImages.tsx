import { memo } from 'react'
import type { ToolResultContent } from '@/lib/transcript/types'
import { ImageChip } from '../ImageChip'

/** Image blocks of a tool result as lightbox thumbnails. */
export const ResultImages = memo(function ResultImages({ content }: { content: ToolResultContent[] }) {
  const images = content.flatMap((c) => (c.type === 'image' ? [c] : []))
  if (images.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {images.map((c, i) => (
        <ImageChip key={i} mediaType={c.mediaType} base64={c.base64} alt={`Result image ${i + 1}`} />
      ))}
    </div>
  )
})
