// Flattens a Session into the virtualized row model.
import type { AbandonedBranch, Session, Turn, TurnItem } from '@/lib/transcript/types'

export type ChatRow =
  | { kind: 'prompt'; id: string; turnId: string; turn: Turn }
  | { kind: 'item'; id: string; turnId: string; turn: Turn; item: TurnItem; firstAssistant: boolean }
  | { kind: 'abandoned'; id: string; turnId: string; branch: AbandonedBranch; count: number }
  | { kind: 'hidden-context-toggle'; id: string; turnId: string; turn: Turn }
  | { kind: 'interrupted'; id: string; turnId: string; turn: Turn }

export type RowKind = ChatRow['kind']

export interface RowModel {
  rows: ChatRow[]
  /** Row index by row id, plus block ids and hidden-context item ids pointing at their row. */
  indexById: Map<string, number>
}

export const hiddenContextRowId = (turnId: string) => `${turnId}::context`
export const interruptedRowId = (turnId: string) => `${turnId}::interrupted`
export const abandonedRowId = (branch: AbandonedBranch, i: number) =>
  `abandoned::${branch.forkAfterUuid}::${i}`

export function buildRows(session: Session): RowModel {
  const rows: ChatRow[] = []
  const indexById = new Map<string, number>()
  const push = (row: ChatRow) => {
    indexById.set(row.id, rows.length)
    rows.push(row)
  }
  const alias = (id: string, index: number) => {
    if (!indexById.has(id)) indexById.set(id, index)
  }

  // Abandoned branches render right after their anchor row; several on one anchor collapse into one stub.
  const byAnchor = new Map<string, AbandonedBranch[]>()
  for (const b of session.abandoned) {
    const list = byAnchor.get(b.anchorRowId) ?? []
    list.push(b)
    byAnchor.set(b.anchorRowId, list)
  }
  const placed = new Set<string>()
  const pushAbandoned = (anchorId: string, turnId: string) => {
    const list = byAnchor.get(anchorId)
    if (!list || placed.has(anchorId)) return
    placed.add(anchorId)
    push({ kind: 'abandoned', id: abandonedRowId(list[0], 0), turnId, branch: list[0], count: list.length })
    // Extra branches on the same anchor are reachable from the stub's raw view.
    for (let i = 1; i < list.length; i++) alias(abandonedRowId(list[i], i), rows.length - 1)
  }

  for (const turn of session.turns) {
    const hasPromptRow = turn.prompt !== undefined
    if (hasPromptRow) {
      push({ kind: 'prompt', id: turn.id, turnId: turn.id, turn })
      pushAbandoned(turn.id, turn.id)
    }
    let firstAssistant = true
    for (const item of turn.items) {
      const isAssistant = item.kind === 'assistant'
      push({
        kind: 'item',
        id: item.id,
        turnId: turn.id,
        turn,
        item,
        firstAssistant: isAssistant && firstAssistant,
      })
      if (isAssistant) {
        firstAssistant = false
        for (const b of item.blocks) alias(b.id, rows.length - 1)
      }
      pushAbandoned(item.id, turn.id)
    }
    if (!hasPromptRow) alias(turn.id, Math.max(0, rows.length - turn.items.length))
    const hasInterruptEvent = turn.items.some((i) => i.kind === 'event' && i.category === 'interrupt')
    if (turn.interrupted && !hasInterruptEvent) {
      push({ kind: 'interrupted', id: interruptedRowId(turn.id), turnId: turn.id, turn })
    }
    if (turn.hiddenContext.length > 0) {
      push({ kind: 'hidden-context-toggle', id: hiddenContextRowId(turn.id), turnId: turn.id, turn })
      for (const h of turn.hiddenContext) alias(h.id, rows.length - 1)
    }
  }

  // Anchors that matched no row: keep them reachable at the end.
  for (const [anchorId] of byAnchor) pushAbandoned(anchorId, session.turns.at(-1)?.id ?? '')

  return { rows, indexById }
}

/**
 * Small centred pills (events, the context-items toggle, slash commands, interrupt and rewind markers).
 * Consecutive ones stack tightly in one centred column.
 */
export function isChipRow(row: ChatRow | undefined): boolean {
  if (!row) return false
  switch (row.kind) {
    case 'item':
      return row.item.kind === 'event'
    case 'prompt':
      return row.turn.kind === 'slash-command'
    case 'hidden-context-toggle':
    case 'interrupted':
    case 'abandoned':
      return true
  }
}

/** Vertical padding of a row: 12px, or 2px towards a neighbouring chip row (4px between chips). */
export function rowPadding(rows: readonly ChatRow[], i: number): string {
  const chip = isChipRow(rows[i])
  const top = chip && isChipRow(rows[i - 1]) ? 'pt-0.5' : 'pt-3'
  const bottom = chip && isChipRow(rows[i + 1]) ? 'pb-0.5' : 'pb-3'
  return `${top} ${bottom}`
}

/** Rough initial height per row kind, refined by measureElement. */
export function estimateRowSize(row: ChatRow | undefined): number {
  if (!row) return 80
  switch (row.kind) {
    case 'prompt':
      return row.turn.kind === 'human' ? 96 : 52
    case 'item':
      switch (row.item.kind) {
        case 'assistant':
          return 48 + row.item.blocks.length * 56
        case 'queued-user':
          return 80
        case 'event':
          return 44
        case 'compaction':
          return 56
      }
      return 80
    case 'abandoned':
      return 48
    case 'interrupted':
    case 'hidden-context-toggle':
      return 40
  }
}
