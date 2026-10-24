import { ChevronRight, GitBranch } from 'lucide-react'
import { memo, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { AbandonedBranch } from '@/lib/transcript/types'
import { cn } from '@/lib/utils'
import { useExpanded } from './chatStore'
import { RawJsonDialog } from './RawJsonDialog'

type Props = { rowId: string; branch: AbandonedBranch; count?: number }

/** Collapsed stub for a rewound / edited branch, at the point where it forked off. */
export const AbandonedBranchRow = memo(function AbandonedBranchRow({ rowId, branch, count = 1 }: Props) {
  const [open, toggle] = useExpanded(rowId, false)
  const [rawOpen, setRawOpen] = useState(false)
  return (
    <div className="flex flex-col items-center gap-2" data-testid="abandoned-branch">
      <button
        type="button"
        aria-expanded={open}
        onClick={toggle}
        className="inline-flex h-6 items-center gap-1.5 rounded-full border border-dashed border-border px-2.5 text-[12px] text-fg-muted outline-none hover:bg-hover hover:text-fg-secondary focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <GitBranch className="size-3.5" />
        Edited / retried · {count} earlier version{count === 1 ? '' : 's'}
        <ChevronRight className={cn('size-3 transition-transform duration-150', open && 'rotate-90')} />
      </button>
      {open && (
        <div className="flex w-full flex-col items-end gap-2">
          <div className="max-w-[80%] rounded-2xl border border-dashed border-border px-4 py-3 whitespace-pre-wrap text-fg-secondary">
            {branch.firstPromptPreview || (
              <span className="italic text-fg-muted">No prompt in this branch</span>
            )}
          </div>
          <Button
            variant="ghost"
            size="xs"
            className="text-fg-muted hover:bg-hover hover:text-fg"
            onClick={() => setRawOpen(true)}
          >
            View raw ({branch.records.length} record{branch.records.length === 1 ? '' : 's'})
          </Button>
          {rawOpen && (
            <RawJsonDialog
              open={rawOpen}
              onOpenChange={setRawOpen}
              records={branch.records}
              title="Abandoned branch"
            />
          )}
        </div>
      )}
    </div>
  )
})
