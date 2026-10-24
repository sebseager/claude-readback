// Test helper: where did every record line of a folded session end up?
import type { Session, Turn } from '../lib/transcript/types'

export type Place =
  | 'turn'
  | 'checkpoint'
  | 'hidden'
  | 'mention'
  | 'assistant'
  | 'tool-result'
  | 'tool-attachment'
  | 'queued'
  | 'event'
  | 'compaction'
  | 'abandoned'

export function placedLines(session: Pick<Session, 'turns' | 'abandoned'>): Map<number, Place> {
  const m = new Map<number, Place>()
  const put = (line: number | undefined, p: Place) => {
    if (line !== undefined && !m.has(line)) m.set(line, p)
  }
  const visit = (turns: readonly Turn[]) => {
    for (const t of turns) {
      for (const l of t.recordLines ?? []) put(l, 'turn')
      put(t.checkpoint?.recordLine, 'checkpoint')
      for (const h of t.hiddenContext) put(h.recordLine, 'hidden')
      for (const mn of t.prompt?.mentions ?? []) put(mn.recordLine, 'mention')
      for (const item of t.items) {
        switch (item.kind) {
          case 'assistant':
            for (const l of item.recordLines) put(l, 'assistant')
            for (const b of item.blocks) {
              if (b.kind !== 'tool') continue
              put(b.result?.recordLine, 'tool-result')
              for (const a of b.attachments) put(a.recordLine, 'tool-attachment')
            }
            break
          case 'queued-user':
            put(item.recordLine, 'queued')
            break
          case 'event':
            for (const l of item.recordLines) put(l, 'event')
            break
          case 'compaction':
            for (const l of item.recordLines) put(l, 'compaction')
            break
        }
      }
    }
  }
  visit(session.turns)
  for (const a of session.abandoned) {
    for (const r of a.records) put(r.line, 'abandoned')
    if (a.turns) visit(a.turns)
  }
  return m
}

/** Record types without a uuid that are consumed as session metadata, not rows. */
export const METADATA_TYPES = new Set([
  'last-prompt',
  'ai-title',
  'atis-latch',
  'mode',
  'permission-mode',
  'agent-name',
  'cost-state',
  'continued-in',
  'queue-operation',
  'file-history-snapshot',
  'file-history-delta',
  'fork-context-ref',
  'summary',
])
