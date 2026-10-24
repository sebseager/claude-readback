// Series colors for the stats panel, derived from the design tokens (docs/DESIGN.md).
// Emphasis scheme: terracotta (--accent) is the primary series; warm grays carry context. The grays sit below the
// chroma floor on purpose (de-emphasis, not identity), so identity is never color-alone: every chart has a legend
// with the value beside its swatch. Checked with the dataviz validator, adjacent pairs in stack order:
//   light (#faf9f5): normal-vision ΔE ≥ 16.2, CVD ΔE ≥ 12.9   dark (#262624): normal ΔE ≥ 16.3, CVD ΔE ≥ 11.5
// Sub-3:1 contrast on the lightest step is relieved by the per-type numbers next to the bar.
import type { Usage } from '@/lib/transcript/types'

/** Put on a wrapper so `var(--stats-*)` resolves (light and `.dark`). */
export const STATS_PALETTE_CLASS =
  '[--stats-input:#57554f] [--stats-cache-write:#8c887e] [--stats-cache-read:#bfbaad] [--stats-output:var(--accent)] ' +
  'dark:[--stats-input:#d4d0c5] dark:[--stats-cache-write:#9c988e] dark:[--stats-cache-read:#6a6861]'

export type TokenKey = Exclude<keyof Usage, 'final'>

export interface TokenSeries {
  key: TokenKey
  label: string
  color: string
  hint: string
}

/** Stack order (fixed; never re-ordered by size). */
export const TOKEN_SERIES: readonly TokenSeries[] = [
  { key: 'inputTokens', label: 'Input', color: 'var(--stats-input)', hint: 'Uncached prompt tokens' },
  {
    key: 'cacheWriteTokens',
    label: 'Cache write',
    color: 'var(--stats-cache-write)',
    hint: 'Prompt tokens written to the prompt cache',
  },
  {
    key: 'cacheReadTokens',
    label: 'Cache read',
    color: 'var(--stats-cache-read)',
    hint: 'Prompt tokens served from the prompt cache',
  },
  { key: 'outputTokens', label: 'Output', color: 'var(--stats-output)', hint: 'Tokens Claude generated' },
]

/** Single-series marks (tool bars, context line). */
export const PRIMARY = 'var(--accent)'
