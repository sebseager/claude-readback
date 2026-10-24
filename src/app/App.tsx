import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { loadShowHiddenContext } from '@/app/prefs'
import { useSearchStore } from '@/app/searchStore'
import { useSessionStore } from '@/app/sessionStore'
import { useUiStore } from '@/app/store'
import { matchesQuery, NARROW_QUERY } from '@/app/useMediaQuery'
import { ChatArea, DropOverlay, MainHeader, Sidebar, StatsPanel } from '@/components/layout'
import { useChatStore } from '@/components/chat/chatStore'
import { loadRehypeHighlight } from '@/components/chat/highlightLoader'
import { loadMarkdownRenderer } from '@/components/chat/markdownLoader'
import { toolCardBody } from '@/components/chat/tool/toolCardBodyLoader'
import { sessionStatsModule } from '@/components/stats/sessionStatsLoader'
import { TooltipProvider } from '@/components/ui/tooltip'

const SettingsSheet = lazy(() =>
  import('@/components/layout/SettingsSheet').then((m) => ({ default: m.SettingsSheet })),
)

const ToasterHost = lazy(() => import('./ToasterHost'))

/** Mounts the settings sheet once it is first opened, then keeps it (so its close animation runs). */
function LazySettings() {
  const open = useUiStore((s) => s.settingsOpen)
  const [wanted, setWanted] = useState(open)
  if (open && !wanted) setWanted(true)
  if (!wanted) return null
  return (
    <Suspense fallback={null}>
      <SettingsSheet />
    </Suspense>
  )
}

export function App() {
  useCollapseStatsOnNarrowScreens()
  useCollapseSidebarOnSmallScreens()
  useBoot()
  usePreloadChunks()
  const session = useSessionStore((s) => s.activeSession)
  const subagentMap = useSessionStore((s) => s.subagentSessions)
  const subagentSessions = useMemo(() => Object.values(subagentMap), [subagentMap])

  return (
    <TooltipProvider delayDuration={800}>
      <div className="flex h-dvh w-full overflow-hidden bg-main text-fg">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <MainHeader />
          <ChatArea />
        </div>
        <StatsPanel session={session} subagentSessions={subagentSessions} />
      </div>
      <LazySettings />
      <DropOverlay />
      <Suspense fallback={null}>
        <ToasterHost />
      </Suspense>
    </TooltipProvider>
  )
}

/** Fetch the lazily split chunks right after first paint, so the first opened session rarely waits. */
function usePreloadChunks() {
  useEffect(() => {
    void loadMarkdownRenderer()
      .then(() => toolCardBody.load())
      .then(() => sessionStatsModule.load())
      .then(() => loadRehypeHighlight())
  }, [])
}

/** Route picked / dropped files into the library, load it, and reopen the last (or newest) session. */
function useBoot() {
  useEffect(() => {
    const { setFilesHandler } = useUiStore.getState()
    setFilesHandler((files) => void useSessionStore.getState().ingestFiles(files))
    loadShowHiddenContext()
    void useSessionStore.getState().boot()
    // Dev-only handles for scripted checks and poking around in devtools.
    if (import.meta.env.DEV)
      Object.assign(window, {
        __ccv: { session: useSessionStore, chat: useChatStore, search: useSearchStore },
      })
  }, [])
}

/** The stats panel is off by default below 1280px; close it when the window shrinks past that. */
function useCollapseStatsOnNarrowScreens() {
  const setStatsPanelOpen = useUiStore((s) => s.setStatsPanelOpen)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(min-width: 1280px)')
    const onChange = (e: MediaQueryListEvent) => setStatsPanelOpen(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [setStatsPanelOpen])
}

/** Below 768px the sidebar overlays the chat; start collapsed there and collapse when shrinking into it. */
function useCollapseSidebarOnSmallScreens() {
  const setSidebarCollapsed = useUiStore((s) => s.setSidebarCollapsed)
  useEffect(() => {
    if (matchesQuery(NARROW_QUERY)) setSidebarCollapsed(true)
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(NARROW_QUERY)
    const onChange = (e: MediaQueryListEvent) => e.matches && setSidebarCollapsed(true)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [setSidebarCollapsed])
}
