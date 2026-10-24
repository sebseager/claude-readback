// structuredPatch helpers.
import { asArray, asNumber, asRecord } from '../util'

export interface Hunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: string[]
}

export type DiffRow =
  | { kind: 'hunk'; text: string }
  | { kind: 'add' | 'del' | 'ctx'; text: string; oldNo?: number; newNo?: number }

/** Parses `structuredPatch` (unknown shape) into hunks, dropping malformed entries. */
export function toHunks(v: unknown): Hunk[] {
  return (asArray(v) ?? []).flatMap((h) => {
    const r = asRecord(h)
    const lines = asArray(r?.lines)?.filter((l): l is string => typeof l === 'string')
    if (!r || !lines) return []
    return [
      {
        oldStart: asNumber(r.oldStart) ?? 1,
        oldLines: asNumber(r.oldLines) ?? 0,
        newStart: asNumber(r.newStart) ?? 1,
        newLines: asNumber(r.newLines) ?? 0,
        lines,
      },
    ]
  })
}

export function toRows(hunks: Hunk[]): DiffRow[] {
  const rows: DiffRow[] = []
  for (const h of hunks) {
    rows.push({ kind: 'hunk', text: `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@` })
    let o = h.oldStart
    let n = h.newStart
    for (const line of h.lines) {
      const sign = line[0]
      const text = line.slice(1)
      if (sign === '+') rows.push({ kind: 'add', text, newNo: n++ })
      else if (sign === '-') rows.push({ kind: 'del', text, oldNo: o++ })
      else if (sign === '\\') rows.push({ kind: 'ctx', text: line })
      else rows.push({ kind: 'ctx', text, oldNo: o++, newNo: n++ })
    }
  }
  return rows
}

/** Old/new strings as a plain two-colour diff (Edit input). */
export function stringsToHunk(oldString: string, newString: string): Hunk {
  const del = oldString === '' ? [] : oldString.split('\n').map((l) => `-${l}`)
  const add = newString === '' ? [] : newString.split('\n').map((l) => `+${l}`)
  return { oldStart: 1, oldLines: del.length, newStart: 1, newLines: add.length, lines: [...del, ...add] }
}
