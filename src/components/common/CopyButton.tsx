import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { copyToClipboard } from './clipboard'

type Props = {
  /** Text to copy, or a function producing it lazily (large payloads). */
  text: string | (() => string)
  label?: string
  /** Show the label next to the icon. */
  showLabel?: boolean
  className?: string
}

/** Small ghost button that copies text and briefly shows a check mark. */
export function CopyButton({ text, label = 'Copy', showLabel = false, className }: Props) {
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => setDone(false), 1500)
    return () => clearTimeout(t)
  }, [done])
  return (
    <Button
      type="button"
      variant="ghost"
      size={showLabel ? 'xs' : 'icon-xs'}
      aria-label={label}
      className={cn('text-fg-muted hover:bg-hover hover:text-fg', className)}
      onClick={(e) => {
        e.stopPropagation()
        void copyToClipboard(typeof text === 'function' ? text() : text).then(setDone)
      }}
    >
      {done ? <Check /> : <Copy />}
      {showLabel && <span>{done ? 'Copied' : label}</span>}
    </Button>
  )
}
