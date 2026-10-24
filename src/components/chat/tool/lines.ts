// Line helpers that avoid splitting huge strings when only the head is needed.

/** The first `n` lines of `text` (without the trailing newline). */
export function headLines(text: string, n: number): string {
  let idx = -1
  for (let i = 0; i < n; i++) {
    idx = text.indexOf('\n', idx + 1)
    if (idx === -1) return text
  }
  return text.slice(0, idx)
}

export { splitLines, stripCatN } from '@/lib/transcript/util'
