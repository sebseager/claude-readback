import { FolderOpen, Lock } from 'lucide-react'
import { StarMark } from '@/components/common/StarMark'
import { openFilePicker } from '@/components/common/filePicker'
import { Button } from '@/components/ui/button'

export function EmptyState() {
  return (
    <div className="flex h-full min-h-[420px] flex-col items-center justify-center px-6 py-16 text-center">
      <StarMark className="mb-6 size-12" />
      <h2 className="max-w-xl font-serif text-[34px] leading-[1.15] font-normal tracking-tight text-fg text-balance">
        Drop a Claude Code session to begin
      </h2>
      <p className="mt-3 max-w-md text-[15px] text-fg-secondary text-pretty">
        Open a <code className="rounded bg-bubble px-1 py-px text-[13px]">.jsonl</code> transcript from{' '}
        <code className="rounded bg-bubble px-1 py-px text-[13px]">~/.claude/projects</code>. Subagent
        transcripts and <code className="rounded bg-bubble px-1 py-px text-[13px]">.meta.json</code> files can
        come along too.
      </p>
      <Button size="lg" className="mt-7 gap-2 rounded-lg px-4" onClick={openFilePicker}>
        <FolderOpen />
        Choose files
      </Button>
      <p className="mt-3 text-sm text-fg-muted">or drag and drop them anywhere in this window</p>
      <p className="mt-10 inline-flex items-center gap-1.5 text-xs text-fg-muted">
        <Lock className="size-3" />
        Runs entirely in your browser. Nothing is uploaded.
      </p>
    </div>
  )
}
