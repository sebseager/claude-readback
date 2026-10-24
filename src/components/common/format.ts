// Small, dependency-free formatters shared by chat and stats.

/** 812 → "812", 12_400 → "12.4k", 180_000 → "180k", 1_100_000 → "1.1M". */
export function formatTokens(n: number): string {
  if (!Number.isFinite(n)) return '–'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs < 1000) return `${sign}${Math.round(abs)}`
  const fmt = (v: number, unit: string) => {
    const s = v >= 100 ? Math.round(v).toString() : v.toFixed(1).replace(/\.0$/, '')
    return `${sign}${s}${unit}`
  }
  if (abs < 999_500) return fmt(abs / 1000, 'k')
  if (abs < 999_500_000) return fmt(abs / 1_000_000, 'M')
  return fmt(abs / 1_000_000_000, 'B')
}

/** 340 → "340ms", 4200 → "4.2s", 105_284 → "1m 45s", 3_723_000 → "1h 2m". */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '–'
  if (ms < 1000) return `${Math.round(ms)}ms`
  const s = ms / 1000
  if (s < 60) return `${s < 10 ? s.toFixed(1).replace(/\.0$/, '') : Math.round(s)}s`
  const totalS = Math.round(s)
  const m = Math.floor(totalS / 60)
  if (m < 60) return `${m}m ${totalS % 60}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

/** Milliseconds between two ISO timestamps, or undefined when either is missing/invalid or negative. */
export function elapsedMs(from?: string, to?: string): number | undefined {
  if (!from || !to) return undefined
  const d = Date.parse(to) - Date.parse(from)
  // Timestamps are not always monotonic (clock skew, copied records): clamp at 0, never show negatives.
  return Number.isFinite(d) ? Math.max(0, d) : undefined
}

const timeFmt =
  typeof Intl !== 'undefined'
    ? new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : undefined
const dateTimeFmt =
  typeof Intl !== 'undefined'
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' })
    : undefined

/** "14:03:12" (locale) for an ISO timestamp; empty string when invalid. */
export function formatTime(iso?: string): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  return Number.isFinite(t) && timeFmt ? timeFmt.format(t) : ''
}

/** "24 Oct 2026, 14:03:12" (locale) for an ISO timestamp; empty string when invalid. */
export function formatDateTime(iso?: string): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  return Number.isFinite(t) && dateTimeFmt ? dateTimeFmt.format(t) : ''
}

/** Number of lines in a string ("" → 0, "a" → 1, "a\n" → 1). */
export function countLines(text: string): number {
  if (!text) return 0
  let n = 1
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++
  return text.endsWith('\n') ? n - 1 : n
}
