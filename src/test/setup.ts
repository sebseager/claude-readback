import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
})

// jsdom lacks matchMedia; Radix and our theme helper probe it.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}

// jsdom lacks ResizeObserver (used by Radix ScrollArea, @tanstack/react-virtual).
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

// The markdown renderer, highlight.js and the tool renderers load lazily in the app; tests render them
// synchronously.
const [{ loadMarkdownRenderer }, { loadRehypeHighlight }, { toolCardBody }, { sessionStatsModule }] =
  await Promise.all([
    import('@/components/chat/markdownLoader'),
    import('@/components/chat/highlightLoader'),
    import('@/components/chat/tool/toolCardBodyLoader'),
    import('@/components/stats/sessionStatsLoader'),
  ])
await Promise.all([
  loadMarkdownRenderer(),
  loadRehypeHighlight(),
  toolCardBody.load(),
  sessionStatsModule.load(),
])
