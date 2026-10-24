import { FileUp } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { collectDroppedFiles } from '@/app/files'
import { emitFiles } from '@/app/store'

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')

/**
 * Full-window drop zone. Listens on `window`; a depth counter avoids the dragleave flicker
 * caused by dragenter/dragleave firing for every child element.
 */
export function DropOverlay() {
  const [active, setActive] = useState(false)
  const depth = useRef(0)

  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth.current += 1
      setActive(true)
    }
    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setActive(false)
    }
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth.current = 0
      setActive(false)
      // Dropped folders are walked recursively (`<sessionId>/subagents/…`, whole project folders).
      void collectDroppedFiles(e.dataTransfer).then(emitFiles)
    }
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  if (!active) return null
  return (
    <div
      data-testid="drop-overlay"
      className="pointer-events-none fixed inset-0 z-[100] bg-main/85 p-4 backdrop-blur-sm animate-in fade-in-0 duration-150"
    >
      <div className="flex h-full flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-accent bg-accent/5">
        <div className="flex size-14 items-center justify-center rounded-full bg-accent/15 text-accent">
          <FileUp className="size-7" />
        </div>
        <p className="font-serif text-2xl tracking-tight text-fg">Drop .jsonl files to add sessions</p>
        <p className="text-sm text-fg-muted">
          Session folders, subagent transcripts and .meta.json files are welcome too.
        </p>
      </div>
    </div>
  )
}
