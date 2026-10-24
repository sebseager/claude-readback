// A lazily imported value with a synchronous read: components render a fallback until it arrives and
// re-render when it does. Unlike React.lazy there is no Suspense, and once `load()` has resolved (preloaded
// on app start, or awaited in test setup) every render is synchronous.
import { useSyncExternalStore } from 'react'

export interface LazyModule<T> {
  load: () => Promise<T>
  /** The value once loaded, else null (and loading starts). */
  use: () => T | null
}

export function lazyModule<T>(importer: () => Promise<T>): LazyModule<T> {
  let value: T | null = null
  let pending: Promise<T> | null = null
  const listeners = new Set<() => void>()
  const load = () =>
    (pending ??= importer().then((v) => {
      value = v
      for (const l of listeners) l()
      return v
    }))
  const subscribe = (l: () => void) => {
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }
  const snapshot = () => value
  return {
    load,
    use: () => {
      const v = useSyncExternalStore(subscribe, snapshot, snapshot)
      if (v === null) void load()
      return v
    },
  }
}
