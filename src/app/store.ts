// App-wide UI state. Data (sessions, files) lives elsewhere (src/lib/store, the worker).
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type ChatFont = 'sans' | 'serif'
export type FilesHandler = (files: File[]) => void

export interface UiState {
  sidebarCollapsed: boolean
  statsPanelOpen: boolean
  chatFont: ChatFont
  settingsOpen: boolean
  activeSessionId: string | null
  /**
   * Called with files picked via Upload / "Choose files" or dropped anywhere on the window.
   * The ingest layer replaces it with `setFilesHandler`. Default: console.log.
   */
  onFilesDropped: FilesHandler

  setSidebarCollapsed: (collapsed: boolean) => void
  toggleSidebar: () => void
  setStatsPanelOpen: (open: boolean) => void
  toggleStatsPanel: () => void
  setChatFont: (font: ChatFont) => void
  setSettingsOpen: (open: boolean) => void
  setActiveSessionId: (id: string | null) => void
  setFilesHandler: (handler: FilesHandler) => void
}

const wideScreen = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(min-width: 1280px)').matches
    : true

const defaultFilesHandler: FilesHandler = (files) => {
  console.log(
    '[cc-viewer] files received',
    files.map((f) => `${f.name} (${f.size} B)`),
  )
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      statsPanelOpen: wideScreen(),
      chatFont: 'sans',
      settingsOpen: false,
      activeSessionId: null,
      onFilesDropped: defaultFilesHandler,

      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setStatsPanelOpen: (statsPanelOpen) => set({ statsPanelOpen }),
      toggleStatsPanel: () => set((s) => ({ statsPanelOpen: !s.statsPanelOpen })),
      setChatFont: (chatFont) => set({ chatFont }),
      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
      setActiveSessionId: (activeSessionId) => set({ activeSessionId }),
      setFilesHandler: (onFilesDropped) => set({ onFilesDropped }),
    }),
    {
      name: 'cc-viewer:ui',
      storage: createJSONStorage(() => localStorage),
      // Only durable preferences; panels/session/handlers are per page load.
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed, chatFont: s.chatFont }),
    },
  ),
)

/** Convenience for non-React callers (file picker, drop handler). */
export const emitFiles = (files: File[]): void => {
  if (files.length > 0) useUiStore.getState().onFilesDropped(files)
}
