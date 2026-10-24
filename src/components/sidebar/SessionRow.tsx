import { Download, MoreHorizontal, Trash2 } from 'lucide-react'
import { memo, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { SessionSummary } from '@/lib/transcript/types'
import { cn } from '@/lib/utils'
import { sessionSubtitle } from './grouping'

type Props = {
  session: SessionSummary
  active: boolean
  onSelect: (sessionId: string) => void
  onExport: (sessionId: string) => void
  onDelete: (sessionId: string) => void
}

/** One conversation in the sidebar: title + subtitle, hover `…` menu with export / delete. */
export const SessionRow = memo(function SessionRow({
  session: s,
  active,
  onSelect,
  onExport,
  onDelete,
}: Props) {
  const [confirm, setConfirm] = useState(false)
  const subagents = s.subagentFilesPresent
  return (
    <div
      data-testid="session-row"
      data-session-id={s.sessionId}
      className={cn(
        'group relative flex items-center rounded-lg transition-colors duration-150',
        active ? 'bg-bubble' : 'hover:bg-hover',
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(s.sessionId)}
        aria-current={active ? 'true' : undefined}
        className="min-w-0 flex-1 rounded-lg px-2.5 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <div className="truncate text-sm leading-5 text-fg">{s.title}</div>
        <div className="truncate text-xs leading-4 text-fg-muted">{sessionSubtitle(s)}</div>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Actions for ${s.title}`}
            className="mr-1.5 text-fg-secondary opacity-0 group-hover:opacity-100 hover:bg-hover focus-visible:opacity-100 data-[state=open]:opacity-100"
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="right" className="w-56">
          <DropdownMenuItem onSelect={() => onExport(s.sessionId)}>
            <Download />
            {subagents > 0 ? 'Export JSONL (.zip)' : 'Export JSONL'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(true)}>
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this session?</AlertDialogTitle>
            <AlertDialogDescription>
              “{s.title}” and its subagent transcripts will be removed from this browser. Your files on disk
              are not touched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger text-white hover:bg-danger/90"
              onClick={() => onDelete(s.sessionId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
})
