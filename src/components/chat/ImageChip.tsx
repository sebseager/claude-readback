import { memo, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { dataUrl } from './util'

type Props = { mediaType: string; base64: string; alt?: string }

/** Thumbnail that opens a lightbox. */
export const ImageChip = memo(function ImageChip({ mediaType, base64, alt = 'Attached image' }: Props) {
  const [open, setOpen] = useState(false)
  const src = dataUrl(mediaType, base64)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Open ${alt.toLowerCase()}`}
        className="size-14 shrink-0 overflow-hidden rounded-lg border border-border bg-bubble transition-opacity duration-150 outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <img src={src} alt={alt} className="size-full object-cover" />
      </button>
      {open && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="w-auto max-w-[min(92vw,1100px)] bg-main p-3 sm:max-w-[min(92vw,1100px)]">
            <DialogTitle className="sr-only">{alt}</DialogTitle>
            <DialogDescription className="sr-only">{mediaType}</DialogDescription>
            <img
              src={src}
              alt={alt}
              className="max-h-[80vh] max-w-full rounded-lg object-contain [image-rendering:auto]"
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  )
})
