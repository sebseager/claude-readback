import type { RawRecord } from './types'

export interface ParseError {
  line: number
  message: string
}

export interface ParseResult {
  records: RawRecord[]
  errors: ParseError[]
}

const MAX_ERRORS = 200

/**
 * Parse a JSONL transcript. Tolerant: blank lines are skipped silently, invalid lines (including a
 * partial final line) are skipped and reported. `line` is the 0-based physical line index.
 * Linear in input size: one `split('\n')`, one `JSON.parse` per line, no whole-string regex.
 */
export function parseJsonl(text: string): ParseResult {
  const records: RawRecord[] = []
  const errors: ParseError[] = []
  if (!text) return { records, errors }
  const lines = text.split('\n')
  let suppressed = 0
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]
    if (line.length === 0) continue
    if (line.charCodeAt(line.length - 1) === 13) line = line.slice(0, -1) // CRLF
    if (i === 0 && line.charCodeAt(0) === 0xfeff) line = line.slice(1) // BOM
    if (line.trim().length === 0) continue
    let value: unknown
    try {
      value = JSON.parse(line)
    } catch (err) {
      if (errors.length < MAX_ERRORS) {
        const isLast = i === lines.length - 1 || (i === lines.length - 2 && lines[lines.length - 1] === '')
        const reason = err instanceof Error ? err.message : String(err)
        errors.push({ line: i, message: isLast ? `Partial last line (${reason})` : reason })
      } else suppressed++
      continue
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      if (errors.length < MAX_ERRORS) errors.push({ line: i, message: 'Line is not a JSON object' })
      else suppressed++
      continue
    }
    const rec = value as Record<string, unknown>
    // `line` is ours; a record that happens to carry its own `line` field keeps it under `_line`.
    if ('line' in rec) rec._line = rec.line
    rec.line = i
    if (typeof rec.type !== 'string') rec.type = 'unknown'
    records.push(rec as RawRecord)
  }
  if (suppressed > 0) errors.push({ line: -1, message: `${suppressed} more invalid lines not listed` })
  return { records, errors }
}

/** Binary search a record by its line index (records are in line order). */
export function recordByLine(records: readonly RawRecord[], line: number): RawRecord | undefined {
  let lo = 0
  let hi = records.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const l = records[mid].line
    if (l === line) return records[mid]
    if (l < line) lo = mid + 1
    else hi = mid - 1
  }
  return undefined
}
