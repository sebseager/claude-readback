/// <reference types="node" />
// LOCAL-ONLY robustness check over the real transcripts in ~/.claude/projects. Skipped unless
// CC_REAL_TRANSCRIPTS=1. Prints counts and timings only: never content, paths or identifiers.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { computeStats } from '../stats'
import { foldSession } from './fold'
import { parseJsonl } from './parse'
import type { Session, Turn } from './types'

const enabled = process.env.CC_REAL_TRANSCRIPTS === '1'

function walk(dir: string, out: string[]) {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const e of entries) {
    const p = join(dir, e)
    let st
    try {
      st = statSync(p)
    } catch {
      continue
    }
    if (st.isDirectory()) walk(p, out)
    else if (e.endsWith('.jsonl') && e !== 'journal.jsonl') out.push(p)
  }
}

const groupedLines = (turns: readonly Turn[], into: Set<number>) => {
  for (const t of turns)
    for (const i of t.items) if (i.kind === 'assistant') for (const l of i.recordLines) into.add(l)
}

describe.skipIf(!enabled)('real transcripts (local only)', () => {
  it('folds every file without throwing', { timeout: 600_000 }, () => {
    const files: string[] = []
    walk(join(homedir(), '.claude', 'projects'), files)
    let failures = 0
    let assistantRecords = 0
    let ungrouped = 0
    let uuidRecords = 0
    let activeRecords = 0
    let duplicateRecords = 0
    let filesBelow95 = 0
    let parseErrors = 0
    let bytes = 0
    let largest = { size: 0, ms: 0, parseMs: 0, records: 0, turns: 0 }
    const kinds: Record<string, number> = {}
    let mainFiles = 0
    let subagentFiles = 0
    let totalFoldMs = 0
    let negativeDurations = 0
    let statsFailures = 0
    const titleSources: Record<string, number> = {}
    let zeroHumanTurns = 0
    let emptySearchIndex = 0
    for (const f of files) {
      const text = readFileSync(f, 'utf8')
      bytes += text.length
      const t0 = performance.now()
      const { records, errors } = parseJsonl(text)
      const t1 = performance.now()
      parseErrors += errors.length
      let s: Session
      try {
        s = foldSession(records, { fileKey: 'file' })
      } catch {
        failures++
        continue
      }
      const t2 = performance.now()
      totalFoldMs += t2 - t1
      if (text.length > largest.size)
        largest = {
          size: text.length,
          ms: Math.round(t2 - t1),
          parseMs: Math.round(t1 - t0),
          records: records.length,
          turns: s.turns.length,
        }
      if (s.summary.parent) subagentFiles++
      else mainFiles++
      const grouped = new Set<number>()
      groupedLines(s.turns, grouped)
      for (const a of s.abandoned) groupedLines(a.turns ?? [], grouped)
      const seen = new Set<string>()
      let fileUuid = 0
      for (const r of records) {
        if (typeof r.uuid === 'string') {
          if (seen.has(r.uuid)) {
            duplicateRecords++
            continue
          }
          seen.add(r.uuid)
          fileUuid++
        }
        if (r.type === 'assistant') {
          assistantRecords++
          if (!grouped.has(r.line)) ungrouped++
        }
      }
      const abandoned = s.abandoned.reduce((n, a) => n + a.records.length, 0)
      uuidRecords += fileUuid
      activeRecords += fileUuid - abandoned
      if (fileUuid > 0 && (fileUuid - abandoned) / fileUuid < 0.95) filesBelow95++
      for (const t of s.turns) kinds[t.kind] = (kinds[t.kind] ?? 0) + 1
      // Durations must never be negative, even with non-monotonic timestamps.
      const sum = s.summary
      const durations = [
        sum.durationMs,
        sum.activeMs ?? 0,
        sum.thinkingMs ?? 0,
        ...s.turns.map((t) => t.durationMs ?? 0),
      ]
      if (durations.some((d) => d < 0 || !Number.isFinite(d))) negativeDurations++
      try {
        const st = computeStats(s)
        const gaps = st.turnGaps
        if (st.totals.wallMs < 0 || (gaps && (gaps.medianMs < 0 || gaps.gaps.some((g) => g.ms < 0))))
          negativeDurations++
      } catch {
        statsFailures++
      }
      if (!sum.parent) {
        titleSources[sum.titleSource] = (titleSources[sum.titleSource] ?? 0) + 1
        if (!s.turns.some((t) => t.kind === 'human')) zeroHumanTurns++
      }
      if (records.length > 0 && s.searchIndex.length === 0) emptySearchIndex++
    }
    const coverage = uuidRecords ? activeRecords / uuidRecords : 1
    console.log(
      JSON.stringify(
        {
          files: files.length,
          mainFiles,
          subagentFiles,
          megabytes: Math.round(bytes / 1e6),
          failures,
          parseErrors,
          assistantRecords,
          ungrouped,
          uuidRecords,
          duplicateRecords,
          activeCoverage: Number(coverage.toFixed(4)),
          filesBelow95,
          turnKinds: kinds,
          negativeDurations,
          statsFailures,
          titleSources,
          mainFilesWithoutHumanTurns: zeroHumanTurns,
          emptySearchIndex,
          totalFoldSeconds: Number((totalFoldMs / 1000).toFixed(1)),
          largestFile: {
            megabytes: Number((largest.size / 1e6).toFixed(1)),
            parseMs: largest.parseMs,
            foldMs: largest.ms,
            records: largest.records,
            turns: largest.turns,
          },
        },
        null,
        2,
      ),
    )
    expect(failures).toBe(0)
    expect(statsFailures).toBe(0)
    expect(negativeDurations).toBe(0)
    expect(ungrouped).toBe(0)
    expect(coverage).toBeGreaterThanOrEqual(0.95)
  })
})
