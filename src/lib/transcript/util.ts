// Narrowing helpers for the raw-record boundary. Everything coming out of JSON.parse is `unknown`
// until it passes through one of these.

export type Obj = Record<string, unknown>

export const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

export const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

export const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined

/** A non-negative duration (clamps values from out-of-order timestamps or bad records at 0). */
export const durationMs = (v: unknown): number | undefined => {
  const n = num(v)
  return n === undefined ? undefined : Math.max(0, n)
}

export const arr = (v: unknown): unknown[] | undefined => (Array.isArray(v) ? v : undefined)

export const obj = (v: unknown): Obj | undefined => (isObj(v) ? v : undefined)

/** Safe nested lookup: get(r, 'message', 'usage', 'input_tokens'). */
export const get = (v: unknown, ...path: (string | number)[]): unknown => {
  let cur: unknown = v
  for (const key of path) {
    if (typeof key === 'number') {
      if (!Array.isArray(cur)) return undefined
      cur = cur[key]
    } else {
      if (!isObj(cur)) return undefined
      cur = cur[key]
    }
  }
  return cur
}

/** Strip ANSI SGR / CSI escape sequences (slash-command stdout carries them). */
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g
export const stripAnsi = (s: string): string => (s.includes('\x1b') ? s.replace(ANSI_RE, '') : s)

/** Text between `<tag>` and `</tag>` (first occurrence), or undefined. Linear, no regex backtracking. */
export const tagContent = (text: string, tag: string, from = 0): string | undefined => {
  const open = `<${tag}>`
  const start = text.indexOf(open, from)
  if (start < 0) return undefined
  const close = `</${tag}>`
  const end = text.indexOf(close, start + open.length)
  if (end < 0) return undefined
  return text.slice(start + open.length, end)
}

export const basename = (p: string): string => {
  const trimmed = p.replace(/[/\\]+$/, '')
  const i = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  return i >= 0 ? trimmed.slice(i + 1) : trimmed
}

export const truncate = (s: string, max: number): string => (s.length > max ? `${s.slice(0, max - 1)}…` : s)

export const tsMs = (iso: string | undefined): number | undefined => {
  if (!iso) return undefined
  const t = Date.parse(iso)
  return Number.isNaN(t) ? undefined : t
}

/**
 * Compact one-line JSON preview that never serialises more than ~`max` characters of a huge input
 * (Write content, base64…): long strings are cut before stringifying.
 */
export const compactJson = (value: unknown, max = 80): string => {
  const shrink = (v: unknown, depth: number): unknown => {
    if (typeof v === 'string') return v.length > max ? `${v.slice(0, max)}…` : v
    if (depth > 3) return Array.isArray(v) ? '[…]' : isObj(v) ? '{…}' : v
    if (Array.isArray(v)) return v.slice(0, 10).map((x) => shrink(x, depth + 1))
    if (isObj(v)) {
      const out: Obj = {}
      let n = 0
      for (const k in v) {
        if (n++ >= 12) break
        out[k] = shrink(v[k], depth + 1)
      }
      return out
    }
    return v
  }
  let s: string
  try {
    s = JSON.stringify(shrink(value, 0)) ?? String(value)
  } catch {
    s = String(value)
  }
  return truncate(s, max)
}

/**
 * Content-derived identifier (session id, agent id) made safe for storage keys and archive paths:
 * anything outside `[A-Za-z0-9._-]` becomes `_`; empty or all-dot results (`.`, `..`) are rejected.
 */
export function safeId(id: string | undefined): string | undefined {
  if (id === undefined) return undefined
  const slug = id.replace(/[^A-Za-z0-9._-]/g, '_')
  return /^\.*$/.test(slug) ? undefined : slug
}

/** A relative path with `\` normalised to `/` and empty, `.` and `..` segments dropped. */
export function safeRelativePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .split('/')
    .filter((seg) => seg !== '' && seg !== '.' && seg !== '..')
    .join('/')
}

/** Lines of `text`, dropping one trailing empty line. */
export function splitLines(text: string): string[] {
  const lines = text.split('\n')
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

const CAT_N = /^\s*(\d+)(?:\t|→)(.*)$/

/**
 * Strips a `cat -n` style prefix ("     1\tcode" or "  1→code") when most lines carry it.
 * Returns the first line number and the bare lines.
 */
export function stripCatN(text: string): { startLine: number; lines: string[]; stripped: boolean } {
  const lines = splitLines(text)
  let hits = 0
  for (const l of lines) if (CAT_N.test(l)) hits++
  if (lines.length === 0 || hits < Math.max(1, lines.length * 0.8))
    return { startLine: 1, lines, stripped: false }
  let startLine = 1
  const out = lines.map((l, i) => {
    const m = CAT_N.exec(l)
    if (!m) return l
    if (i === 0) startLine = Number(m[1])
    return m[2]
  })
  return { startLine, lines: out, stripped: true }
}
