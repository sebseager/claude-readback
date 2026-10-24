// Small formatters for the session header.

/** "claude-opus-5-5-20261001" → "opus-5-5"; "<synthetic>" and unknown shapes are returned as-is. */
export function shortModel(model: string): string {
  return model
    .replace(/^claude-/, '')
    .replace(/-\d{8}$/, '')
    .replace(/\[1m\]$/i, ' 1M')
}

/** Distinct short model names, in order. */
export function shortModels(models: readonly string[]): string[] {
  const out: string[] = []
  for (const m of models) {
    if (m === '<synthetic>') continue
    const s = shortModel(m)
    if (!out.includes(s)) out.push(s)
  }
  return out
}

const dateTime = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/** "Oct 24, 2026, 09:12" (locale), or "" when invalid. */
export function formatStart(iso: string): string {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? dateTime.format(t) : ''
}

/** "2.1.295" or "2.1.290 → 2.1.295" when the session spans upgrades. */
export function versionLabel(versions: readonly string[]): string | undefined {
  if (versions.length === 0) return undefined
  if (versions.length === 1) return versions[0]
  return `${versions[0]} → ${versions[versions.length - 1]}`
}
