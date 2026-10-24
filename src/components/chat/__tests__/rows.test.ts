import { buildLongMockSession, buildMockSession } from '@/lib/transcript/mock'
import { buildRows, isChipRow, rowPadding } from '../rows'

describe('buildRows', () => {
  const session = buildMockSession()
  const { rows, indexById } = buildRows(session)

  it('emits every row kind, with unique stable ids', () => {
    const kinds = new Set(rows.map((r) => r.kind))
    expect(kinds).toEqual(new Set(['prompt', 'item', 'abandoned', 'hidden-context-toggle', 'interrupted']))
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length)
    expect(buildRows(session).rows.map((r) => r.id)).toEqual(rows.map((r) => r.id))
  })

  it('places the abandoned stub right after its anchor row', () => {
    const i = rows.findIndex((r) => r.kind === 'abandoned')
    expect(rows[i - 1].id).toBe(session.abandoned[0].anchorRowId)
  })

  it('marks only the first assistant group of a turn', () => {
    const turn1 = rows.filter(
      (r) => r.turnId === 'turn-1' && r.kind === 'item' && r.item.kind === 'assistant',
    )
    expect(turn1.map((r) => r.kind === 'item' && r.firstAssistant)).toEqual([true, false, false, false])
  })

  it('indexes block ids and hidden-context ids to their rows', () => {
    expect(rows[indexById.get('toolu_edit_1')!].id).toBe('msg_mock_a2')
    expect(rows[indexById.get('ctx-1-2')!].kind).toBe('hidden-context-toggle')
  })

  it('does not add an interrupted marker when the turn has an interrupt event', () => {
    expect(rows.filter((r) => r.kind === 'interrupted').map((r) => r.turnId)).toEqual(['turn-5'])
  })

  it('builds a long session of about the requested size', () => {
    const long = buildRows(buildLongMockSession(3000)).rows
    expect(long.length).toBeGreaterThanOrEqual(3000)
    expect(long.length).toBeLessThan(3010)
  })
})

describe('rowPadding', () => {
  it('stacks consecutive chip rows 4px apart and keeps 12px elsewhere', () => {
    const { rows } = buildRows(buildMockSession())
    for (let i = 0; i < rows.length; i++) {
      const pad = rowPadding(rows, i)
      const chip = isChipRow(rows[i])
      expect(pad.includes('pt-0.5')).toBe(chip && isChipRow(rows[i - 1]))
      expect(pad.includes('pb-0.5')).toBe(chip && isChipRow(rows[i + 1]))
    }
    expect(rows.some((r, i) => isChipRow(r) && isChipRow(rows[i + 1]))).toBe(true)
  })
})
