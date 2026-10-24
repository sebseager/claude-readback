// Shared, dependency-free number/time formatters (stats panel today; chat can adopt them).

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

/** Full count with thousands separators, for tooltips: 1234567 → "1,234,567". */
export function formatInteger(n: number): string {
  if (!Number.isFinite(n)) return '–'
  return Math.round(n).toLocaleString('en-US')
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
  if (h < 48) return `${h}h ${m % 60}m`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

/** 1.234 → "$1.23", 0.0042 → "$0.0042", 0 → "$0.00", 1234.5 → "$1,234.50". */
export function formatUsd(usd: number): string {
  if (!Number.isFinite(usd)) return '–'
  const sign = usd < 0 ? '-' : ''
  const abs = Math.abs(usd)
  if (abs > 0 && abs < 0.01) return `${sign}$${abs.toPrecision(2).replace(/0+$/, '')}`
  return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** 0.9234 → "92%", 0.0042 → "0.4%", 1 → "100%". */
export function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) return '–'
  const pct = ratio * 100
  if (pct > 0 && pct < 10) return `${pct.toFixed(1).replace(/\.0$/, '')}%`
  return `${Math.round(pct)}%`
}

const timeFmt =
  typeof Intl !== 'undefined'
    ? new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })
    : undefined
const dateTimeFmt =
  typeof Intl !== 'undefined'
    ? new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : undefined

/** "14:03" (locale) for an ISO timestamp; empty string when missing/invalid. */
export function formatClock(iso?: string): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  return Number.isFinite(t) && timeFmt ? timeFmt.format(t) : ''
}

/** "Oct 24, 14:03" (locale) for an ISO timestamp; empty string when missing/invalid. */
export function formatShortDateTime(iso?: string): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  return Number.isFinite(t) && dateTimeFmt ? dateTimeFmt.format(t) : ''
}

const FAMILY = /^claude-(opus|sonnet|haiku|fable|mythos)-(\d+)(?:-(\d{1,2}))?(?:-|$)/
const LEGACY = /^claude-(\d+)(?:-(\d{1,2}))?-(opus|sonnet|haiku)(?:-|$)/

/**
 * Human model name: `claude-opus-5-5` → "Opus 5.5", `claude-haiku-4-5-20251001` → "Haiku 4.5",
 * `us.anthropic.claude-sonnet-4-6[1m]` → "Sonnet 4.6", `claude-3-5-haiku` → "Haiku 3.5".
 * Unknown ids come back unchanged.
 */
export function shortModelName(model: string): string {
  let m = model.trim().toLowerCase()
  const at = m.indexOf('claude-')
  if (at > 0) m = m.slice(at)
  m = m.replace(/\[.*$/, '').replace(/@.*$/, '')
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  const f = FAMILY.exec(m)
  if (f) return `${cap(f[1])} ${f[2]}${f[3] ? `.${f[3]}` : ''}`
  const l = LEGACY.exec(m)
  if (l) return `${cap(l[3])} ${l[1]}${l[2] ? `.${l[2]}` : ''}`
  return model
}
