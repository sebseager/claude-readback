import { Loader2, PanelLeftClose, PanelLeftOpen, Search, Settings, Upload } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useSessionStore } from '@/app/sessionStore'
import { useUiStore } from '@/app/store'
import { useIsNarrow } from '@/app/useMediaQuery'
import { IconButton } from '@/components/common/IconButton'
import { StarMark } from '@/components/common/StarMark'
import { openFilePicker } from '@/components/common/filePicker'
import { SessionList } from '@/components/sidebar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/**
 * Left sidebar: upload, conversation search + list, settings, collapse. Below 768px it floats over the
 * chat (with a backdrop) when expanded, and a rail-sized spacer keeps the chat from shifting.
 */
export function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen)
  const setSidebarCollapsed = useUiStore((s) => s.setSidebarCollapsed)
  const ingesting = useSessionStore((s) => s.ingesting)
  const narrow = useIsNarrow()
  const overlay = narrow && !collapsed
  const [query, setQuery] = useState('')
  const collapse = useCallback(() => setSidebarCollapsed(true), [setSidebarCollapsed])

  useEffect(() => {
    if (!overlay) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && collapse()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [overlay, collapse])

  return (
    <>
      {narrow && <div className="w-rail shrink-0" aria-hidden />}
      {overlay && (
        <div
          data-testid="sidebar-backdrop"
          className="fixed inset-0 z-30 bg-black/30 animate-in fade-in-0 duration-150"
          onClick={collapse}
          aria-hidden
        />
      )}
      <aside
        aria-label="Sessions"
        data-collapsed={collapsed}
        className={cn(
          'flex h-full shrink-0 flex-col overflow-hidden border-r bg-sidebar transition-[width] duration-150 ease-out',
          collapsed ? 'w-rail' : 'w-sidebar',
          narrow && 'fixed inset-y-0 left-0 z-40',
          overlay && 'shadow-2xl',
        )}
      >
        {/* Brand */}
        <div className={cn('flex h-14 shrink-0 items-center gap-2.5', collapsed ? 'justify-center' : 'px-4')}>
          <StarMark className="size-5 shrink-0" />
          {!collapsed && (
            <span className="truncate font-serif text-[17px] font-medium tracking-tight text-fg">
              Claude Readback
            </span>
          )}
        </div>

        {/* Actions */}
        <div className={cn('flex shrink-0 flex-col gap-2 pb-3', collapsed ? 'items-center' : 'px-3')}>
          {collapsed ? (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon-sm"
                    aria-label="Upload sessions"
                    onClick={openFilePicker}
                    disabled={!!ingesting}
                  >
                    {ingesting ? <Loader2 className="animate-spin" /> : <Upload />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Upload sessions</TooltipContent>
              </Tooltip>
              <IconButton
                label="Search conversations"
                side="right"
                onClick={() => setSidebarCollapsed(false)}
              >
                <Search />
              </IconButton>
            </>
          ) : (
            <>
              <Button
                className="w-full justify-start gap-2 px-3 font-medium"
                onClick={openFilePicker}
                disabled={!!ingesting}
              >
                {ingesting ? <Loader2 className="animate-spin" /> : <Upload />}
                {ingesting
                  ? `Adding ${ingesting.count} file${ingesting.count === 1 ? '' : 's'}… ${Math.round(ingesting.progress * 100)}%`
                  : 'Upload'}
              </Button>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-fg-muted" />
                <Input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
                  placeholder="Search conversations"
                  aria-label="Search conversations"
                  className="h-8 border-transparent bg-hover pl-8 text-sm shadow-none placeholder:text-fg-muted focus-visible:border-ring dark:bg-hover"
                />
              </div>
            </>
          )}
        </div>

        {/* Conversation list */}
        <ScrollArea className="min-h-0 flex-1">
          {!collapsed && <SessionList query={query} onPicked={narrow ? collapse : undefined} />}
        </ScrollArea>

        {/* Footer */}
        <div
          className={cn(
            'flex shrink-0 border-t',
            collapsed ? 'flex-col items-center gap-1 py-2' : 'flex-col gap-1.5 px-3 py-2.5',
          )}
        >
          {!collapsed && (
            <p
              className="truncate px-1 text-[11px] leading-snug text-fg-muted"
              title="Runs entirely in your browser. Nothing is uploaded."
            >
              Runs in your browser · nothing uploaded
            </p>
          )}
          <div className={cn('flex items-center', collapsed ? 'flex-col gap-1' : 'justify-between')}>
            <IconButton
              label="Settings"
              side={collapsed ? 'right' : 'top'}
              onClick={() => setSettingsOpen(true)}
            >
              <Settings />
            </IconButton>
            <IconButton
              label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              side={collapsed ? 'right' : 'top'}
              onClick={toggleSidebar}
            >
              {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            </IconButton>
          </div>
        </div>
      </aside>
    </>
  )
}
