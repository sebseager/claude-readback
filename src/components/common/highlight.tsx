// Search-match highlighting for plain text. Markdown uses the rehype variant in chat/Markdown.
import type { ReactNode } from 'react'

/**
 * At most this many <mark>s are rendered per text (huge outputs stay cheap): a window around the active
 * match when there is one, else the first ones. Every match still counts, so occurrences stay aligned.
 */
export const MAX_MARKS = 300

/** [from, to) of the match indexes to render as marks. */
export function markWindow(active: number | undefined): [number, number] {
  if (active === undefined) return [0, MAX_MARKS]
  const from = Math.max(0, active - MAX_MARKS / 2)
  return [from, from + MAX_MARKS]
}

export const MARK_CLASS = 'rounded-sm bg-accent/30 text-inherit'
export const MARK_ACTIVE_CLASS = 'ring-2 ring-accent'

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Case-insensitive global matcher for `query`, or null when the query is empty/blank. */
export function searchRegExp(query: string): RegExp | null {
  if (!query || !query.trim()) return null
  return new RegExp(escapeRegExp(query), 'gi')
}

/** Start/end offsets of every case-insensitive, non-overlapping match. */
export function findMatches(text: string, query: string): Array<[number, number]> {
  const re = searchRegExp(query)
  if (!re || !text) return []
  const out: Array<[number, number]> = []
  for (const m of text.matchAll(re)) out.push([m.index, m.index + m[0].length])
  return out
}

export function countMatches(text: string, query: string): number {
  return findMatches(text, query).length
}

/**
 * Wraps case-insensitive matches of `query` in `<mark>`. The `activeIndex`-th match (0-based, counted within
 * this text) gets a ring and `data-search-active` so the list can scroll it into view. Returns `text`
 * unchanged when the query is empty or nothing matches. Long texts mark at most MAX_MARKS matches, around
 * the active one.
 */
export function highlightText(text: string, query: string, activeIndex?: number): ReactNode {
  if (!query || !text) return text
  const all = findMatches(text, query)
  if (all.length === 0) return text
  const [from, to] = markWindow(activeIndex)
  const matches = all.slice(from, to)
  const parts: ReactNode[] = []
  let last = 0
  matches.forEach(([start, end], j) => {
    const i = from + j
    if (start > last) parts.push(text.slice(last, start))
    const active = i === activeIndex
    parts.push(
      <mark
        key={start}
        className={active ? `${MARK_CLASS} ${MARK_ACTIVE_CLASS}` : MARK_CLASS}
        data-search-active={active ? '' : undefined}
      >
        {text.slice(start, end)}
      </mark>,
    )
    last = end
  })
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

/**
 * Spreads an occurrence counted over consecutive texts (the search index joins them) onto each text:
 * returns, per text, the local occurrence to ring, or undefined.
 */
export function splitActive(
  texts: readonly (string | undefined)[],
  query: string,
  active: number | undefined,
): (number | undefined)[] {
  const out: (number | undefined)[] = texts.map(() => undefined)
  if (active === undefined || !query.trim()) return out
  let left = active
  for (let i = 0; i < texts.length; i++) {
    const n = countMatches(texts[i] ?? '', query)
    if (left < n) {
      out[i] = left
      return out
    }
    left -= n
  }
  return out
}

/**
 * A highlighter for several texts rendered in order by one component: each call marks its text and rings
 * the match whose running occurrence (across all calls so far) is `active`.
 */
export function sequentialHighlighter(
  query: string,
  active: number | undefined,
): (text: string) => ReactNode {
  let seen = 0
  return (text: string) => {
    if (!query.trim()) return text
    const n = countMatches(text, query)
    const local = active !== undefined && active >= seen && active < seen + n ? active - seen : undefined
    seen += n
    return highlightText(text, query, local)
  }
}
