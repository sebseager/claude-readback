import { useSyncExternalStore } from 'react'

/** Below this width the sidebar overlays the chat instead of taking space (DESIGN.md: "doesn't break"). */
export const NARROW_QUERY = '(max-width: 767px)'

const mql = (query: string): MediaQueryList | null =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query) : null

export function matchesQuery(query: string): boolean {
  return mql(query)?.matches ?? false
}

/** Live `matchMedia(query).matches`. False where matchMedia is unavailable. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const m = mql(query)
      m?.addEventListener('change', onChange)
      return () => m?.removeEventListener('change', onChange)
    },
    () => matchesQuery(query),
    () => false,
  )
}

export const useIsNarrow = () => useMediaQuery(NARROW_QUERY)
