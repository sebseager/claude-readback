// Flat search index over a folded session, and case-insensitive substring search over it.
import { notificationParts, slashCommandParts, toolInputParts, toolResultParts } from './searchText'
import type { PromptSegment, SearchEntry, SearchMatch, Turn } from './types'

export type Match = SearchMatch

/** Per-entry cap so one 5 MB tool result cannot dominate memory or search time. */
export const MAX_ENTRY_CHARS = 200_000

const BASE64_RUN = /[A-Za-z0-9+/=]{200,}/g

/** Replace long base64-looking runs (images, PDFs) with a marker. */
export function stripBase64(s: string): string {
  if (s.length < 200) return s
  return s.replace(BASE64_RUN, '[base64]')
}

const cap = (s: string) => (s.length > MAX_ENTRY_CHARS ? s.slice(0, MAX_ENTRY_CHARS) : s)

/** Pre-cap, then strip base64 (so a 5 MB result is not scanned in full). */
const clean = (s: string) => stripBase64(s.length > MAX_ENTRY_CHARS * 2 ? s.slice(0, MAX_ENTRY_CHARS * 2) : s)

/**
 * Build the search index. Row ids follow the UI's row model: the turn id for prompts / hidden
 * context, the item id for assistant / queued / event / compaction rows; `blockId` is the block id
 * inside an assistant item (or `pasted:<index>`, `ctx:<id>`, `att:<id>`).
 */
export function buildSearchIndex(turns: readonly Turn[]): SearchEntry[] {
  const out: SearchEntry[] = []
  const push = (e: SearchEntry) => {
    if (e.text && e.text.trim()) out.push({ ...e, text: cap(e.text) })
  }
  for (const turn of turns) {
    const p = turn.prompt
    if (p) {
      if (p.command) {
        const { label, output } = slashCommandParts(p.command)
        push({ rowId: turn.id, field: 'prompt', text: output ? `${label}\n${output}` : label })
      } else if (turn.kind === 'task-notification') {
        const n = notificationParts(p)
        push({
          rowId: turn.id,
          field: 'prompt',
          text: [n.summary, n.status, n.result].filter(Boolean).join('\n'),
        })
      } else {
        push({ rowId: turn.id, field: 'prompt', text: segmentText(p.segments) })
      }
      pushSegments(push, turn.id, p.segments)
      p.mentions.forEach((m, i) => {
        // The pill shows `@path`; its dialog shows the attached content.
        push({
          rowId: turn.id,
          blockId: `mention:${i}`,
          field: 'context',
          text: m.content ? `@${m.path}\n${m.content}` : `@${m.path}`,
        })
      })
    }
    for (const h of turn.hiddenContext) {
      push({ rowId: turn.id, blockId: `ctx:${h.id}`, field: 'context', text: `${h.label}\n${clean(h.text)}` })
    }
    for (const item of turn.items) {
      switch (item.kind) {
        case 'assistant':
          for (const b of item.blocks) {
            if (b.kind === 'text')
              push({ rowId: item.id, blockId: b.id, field: 'assistant', text: b.markdown })
            else if (b.kind === 'thinking')
              push({ rowId: item.id, blockId: b.id, field: 'thinking', text: b.text })
            else if (b.kind === 'tool') {
              push({
                rowId: item.id,
                blockId: b.id,
                field: 'tool-input',
                text: toolInputParts(b.name, b.input)
                  .map((x) => clean(x.text))
                  .join('\n'),
              })
              // What the Result section shows (rich renderers show structured data, not the raw text).
              push({
                rowId: item.id,
                blockId: b.id,
                field: 'tool-result',
                text: toolResultParts(b)
                  .map((x) => clean(x.text))
                  .join('\n'),
              })
              for (const a of b.attachments) {
                push({
                  rowId: item.id,
                  blockId: b.id,
                  field: 'context',
                  text: `${a.label}\n${clean(a.text)}`,
                })
              }
            } else if (b.kind === 'fallback') {
              push({
                rowId: item.id,
                blockId: b.id,
                field: 'event',
                text: `Model fell back from ${b.from} to ${b.to}`,
              })
            }
          }
          if (item.error) push({ rowId: item.id, field: 'event', text: item.error.text })
          break
        case 'queued-user':
          if (item.segments) {
            push({ rowId: item.id, field: 'prompt', text: segmentText(item.segments) })
            pushSegments(push, item.id, item.segments)
          } else push({ rowId: item.id, field: 'prompt', text: item.text })
          break
        case 'event':
          push({
            rowId: item.id,
            field: 'event',
            text: item.detail ? `${item.label}\n${item.detail}` : item.label,
          })
          break
        case 'compaction':
          push({ rowId: item.id, field: 'event', text: `Context compacted\n${item.summaryMarkdown ?? ''}` })
          break
      }
    }
  }
  return out
}

/** The prose of a prompt as the bubble shows it. */
const segmentText = (segments: readonly PromptSegment[]) =>
  segments
    .flatMap((x) => (x.kind === 'text' ? [x.text] : []))
    .join('\n')
    .trim()

/** Pasted blocks and system reminders: each is its own chip, so its own block id. */
function pushSegments(push: (e: SearchEntry) => void, rowId: string, segments: readonly PromptSegment[]) {
  segments.forEach((x, i) => {
    if (x.kind === 'pasted') push({ rowId, blockId: `pasted:${x.index}`, field: 'pasted', text: x.text })
    else if (x.kind === 'system-reminder') push({ rowId, blockId: `sr:${i}`, field: 'context', text: x.text })
  })
}

// ------------------------------------------------------------------------------------- searching

const lowerCache = new WeakMap<readonly SearchEntry[], (string | null)[]>()

/** Lower-cased texts, cached per index. `null` marks entries whose lower-casing changes length. */
function lowered(index: readonly SearchEntry[]): (string | null)[] {
  let l = lowerCache.get(index)
  if (!l) {
    l = index.map((e) => {
      const lo = e.text.toLowerCase()
      return lo.length === e.text.length ? lo : null
    })
    lowerCache.set(index, l)
  }
  return l
}

const SNIPPET = 40

const flat = (s: string) => s.replace(/\s+/g, ' ')

function snippet(text: string, start: number, end: number): SearchMatch['snippet'] {
  const a = Math.max(0, start - SNIPPET)
  const b = Math.min(text.length, end + SNIPPET)
  return {
    before: (a > 0 ? '…' : '') + flat(text.slice(a, start)).trimStart(),
    match: flat(text.slice(start, end)),
    after: flat(text.slice(end, b)).trimEnd() + (b < text.length ? '…' : ''),
  }
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export interface SearchOptions {
  /** Stop after this many matches (default 5000). */
  limit?: number
  fileKey?: string
}

/** Case-insensitive substring search. Matches are in index order (≈ document order). */
export function searchSession(
  index: readonly SearchEntry[],
  query: string,
  opts: SearchOptions = {},
): SearchMatch[] {
  const q = query.trim() ? query : ''
  if (!q) return []
  const limit = opts.limit ?? 5000
  const lq = q.toLowerCase()
  const low = lowered(index)
  const out: SearchMatch[] = []
  let re: RegExp | undefined
  for (let i = 0; i < index.length && out.length < limit; i++) {
    const e = index[i]
    const add = (start: number, end: number) => {
      const m: SearchMatch = {
        entryIndex: i,
        rowId: e.rowId,
        field: e.field,
        start,
        end,
        snippet: snippet(e.text, start, end),
      }
      if (e.blockId !== undefined) m.blockId = e.blockId
      if (opts.fileKey !== undefined) m.fileKey = opts.fileKey
      out.push(m)
    }
    const lo = low[i]
    if (lo !== null && lq.length === q.length) {
      for (let at = lo.indexOf(lq); at >= 0 && out.length < limit; at = lo.indexOf(lq, at + lq.length)) {
        add(at, at + q.length)
      }
    } else {
      re ??= new RegExp(escapeRe(q), 'giu')
      re.lastIndex = 0
      for (let m = re.exec(e.text); m && out.length < limit; m = re.exec(e.text)) {
        add(m.index, m.index + m[0].length)
        if (m[0].length === 0) re.lastIndex++
      }
    }
  }
  return out
}
