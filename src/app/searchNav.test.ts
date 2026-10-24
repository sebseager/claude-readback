import type { SearchMatch } from '@/lib/transcript/types'
import { counterLabel, occurrences, stepIndex, toActiveMatch } from './searchNav'

const m = (
  rowId: string,
  field: SearchMatch['field'] = 'assistant',
  extra: Partial<SearchMatch> = {},
): SearchMatch => ({
  entryIndex: 0,
  rowId,
  field,
  start: 0,
  end: 1,
  snippet: { before: '', match: 'x', after: '' },
  ...extra,
})

describe('stepIndex', () => {
  it('wraps around in both directions', () => {
    expect(stepIndex(-1, 3, 1)).toBe(0)
    expect(stepIndex(-1, 3, -1)).toBe(2)
    expect(stepIndex(0, 3, 1)).toBe(1)
    expect(stepIndex(2, 3, 1)).toBe(0)
    expect(stepIndex(0, 3, -1)).toBe(2)
    expect(stepIndex(0, 0, 1)).toBe(-1)
  })
})

describe('occurrences', () => {
  it('counts per row, block, field and file', () => {
    const list = [
      m('r1'),
      m('r1'),
      m('r1', 'thinking'),
      m('r1', 'assistant', { blockId: 'b' }),
      m('r2'),
      m('r1'),
      m('r1', 'assistant', { fileKey: 'sub' }),
    ]
    expect(occurrences(list)).toEqual([0, 1, 0, 0, 0, 2, 0])
  })
})

describe('toActiveMatch / counterLabel', () => {
  it('maps a hit to the chat store shape', () => {
    expect(toActiveMatch(m('r1', 'tool-result', { blockId: 'b', fileKey: 'k' }), 2)).toEqual({
      rowId: 'r1',
      blockId: 'b',
      field: 'tool-result',
      occurrence: 2,
      fileKey: 'k',
    })
    expect(toActiveMatch(m('r1'), 0)).toEqual({ rowId: 'r1', field: 'assistant', occurrence: 0 })
  })

  it('formats k/N', () => {
    expect(counterLabel('', -1, 0)).toBe('')
    expect(counterLabel('x', -1, 0)).toBe('0/0')
    expect(counterLabel('x', 0, 17)).toBe('1/17')
    expect(counterLabel('x', 4, 5000, true)).toBe('5/5000+')
  })
})
