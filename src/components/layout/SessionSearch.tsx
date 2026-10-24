import { ChevronDown, ChevronUp, Loader2, Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { counterLabel } from '@/app/searchNav'
import { SEARCH_LIMIT, useSearchStore } from '@/app/searchStore'
import { useSessionStore } from '@/app/sessionStore'
import { IconButton } from '@/components/common/IconButton'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export const SEARCH_DEBOUNCE_MS = 250

/**
 * Session search: debounced worker search, `k/N`, ↑/↓, Enter / Shift+Enter, Escape clears.
 * ⌘F / Ctrl+F focuses it from anywhere.
 */
export function SessionSearch({ sessionId, className }: { sessionId: string | null; className?: string }) {
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const matches = useSearchStore((s) => s.matches)
  const index = useSearchStore((s) => s.index)
  const query = useSearchStore((s) => s.query)
  const searching = useSearchStore((s) => s.searching)
  const error = useSearchStore((s) => s.error)
  const run = useSearchStore((s) => s.run)
  const next = useSearchStore((s) => s.next)
  const prev = useSearchStore((s) => s.prev)
  const clear = useSearchStore((s) => s.clear)
  const refresh = useSearchStore((s) => s.refresh)
  const loadedSubagents = useSessionStore((s) => Object.keys(s.subagentSessions).length)

  // Debounced search; also re-runs when another session opens.
  useEffect(() => {
    if (!sessionId) {
      clear()
      return
    }
    const t = setTimeout(() => void run(sessionId, text), text.trim() ? SEARCH_DEBOUNCE_MS : 0)
    return () => clearTimeout(t)
  }, [text, sessionId, run, clear])

  // A nested subagent transcript finished loading: its hits join the list (the worker searches it now).
  useEffect(() => {
    if (loadedSubagents > 0) void refresh()
  }, [loadedSubagents, refresh])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'f') {
        if (!inputRef.current || inputRef.current.disabled) return
        e.preventDefault()
        inputRef.current.focus()
        inputRef.current.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const stale = text !== query
  const label = error
    ? '!'
    : stale && text.trim()
      ? ''
      : counterLabel(query, index, matches.length, matches.length >= SEARCH_LIMIT)
  const noHits = !stale && !!query.trim() && matches.length === 0
  const disabled = !sessionId

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (stale && sessionId) void run(sessionId, text)
      else (e.shiftKey ? prev : next)()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setText('')
      clear()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      next()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      prev()
    }
  }

  return (
    <div className={cn('flex min-w-0 items-center gap-1', className)}>
      {/* Flexes with the header; the minimum keeps "Search this session" readable. */}
      <div className="relative min-w-[10.5rem] flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-fg-muted" />
        <Input
          ref={inputRef}
          type="text"
          role="searchbox"
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search this session"
          aria-label="Search this session"
          title={error ? `Search failed: ${error}` : undefined}
          className={cn(
            'h-8 rounded-lg bg-transparent pl-8 text-sm shadow-none placeholder:text-fg-muted dark:bg-transparent',
            text ? 'pr-24' : 'pr-2',
            noHits && 'border-danger/40',
          )}
        />
        <span className="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center gap-1">
          {searching && <Loader2 className="size-3.5 animate-spin text-fg-muted" aria-label="Searching" />}
          <span
            data-testid="search-counter"
            aria-live="polite"
            className={cn('font-mono text-[11px] text-fg-muted tabular-nums', noHits && 'text-danger')}
          >
            {label}
          </span>
          {text && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setText('')
                clear()
                inputRef.current?.focus()
              }}
              className="rounded p-0.5 text-fg-muted hover:bg-hover hover:text-fg"
            >
              <X className="size-3.5" />
            </button>
          )}
        </span>
      </div>
      <IconButton label="Previous match (Shift+Enter)" onClick={prev} disabled={matches.length === 0}>
        <ChevronUp />
      </IconButton>
      <IconButton label="Next match (Enter)" onClick={next} disabled={matches.length === 0}>
        <ChevronDown />
      </IconButton>
    </div>
  )
}
