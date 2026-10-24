import { computeBranching } from './fold/active'
import type { RawRecord } from './types'

let line = 0
const rec = (
  uuid: string,
  parent: string | null,
  type: string,
  extra: Record<string, unknown> = {},
): RawRecord => ({
  line: line++,
  uuid,
  parentUuid: parent,
  type,
  ...extra,
})
const a = (uuid: string, parent: string | null, msg: string) =>
  rec(uuid, parent, 'assistant', { message: { id: msg, content: [] } })
const tr = (uuid: string, parent: string) =>
  rec(uuid, parent, 'user', { message: { content: [{ type: 'tool_result', tool_use_id: 't' }] } })

describe('computeBranching', () => {
  beforeEach(() => {
    line = 0
  })

  it('treats a linear file as fully active', () => {
    const rs = [rec('1', null, 'user'), a('2', '1', 'm1'), tr('3', '2'), a('4', '3', 'm2')]
    const b = computeBranching(rs)
    expect([...b.active].sort()).toEqual(['1', '2', '3', '4'])
    expect(b.abandoned).toEqual([])
  })

  it('pulls in sibling tool results and same-message assistant records', () => {
    // m1 block0 (2) → block1 (3); result of block0 (4) is a child of 2; next message (5) child of result of block1 (6).
    const rs = [
      rec('1', null, 'user'),
      a('2', '1', 'm1'),
      a('3', '2', 'm1'),
      tr('4', '2'),
      rec('7', '4', 'attachment'),
      tr('6', '3'),
      a('5', '6', 'm2'),
    ]
    const b = computeBranching(rs)
    expect(b.active.size).toBe(7)
  })

  it('waits for a message id to become active before adding its sibling records', () => {
    // 3 is an assistant child of attachment 2 with message m1; m1 only becomes active through 4 (on the leaf path).
    const rs = [
      rec('1', null, 'user'),
      rec('2', '1', 'attachment'),
      a('3', '2', 'm1'),
      a('4', '1', 'm1'),
      a('5', '4', 'm1'),
    ]
    const b = computeBranching(rs)
    expect(b.active.has('3')).toBe(true)
  })

  it('leaves rewound branches out and groups them by root', () => {
    const rs = [
      rec('1', null, 'user'),
      a('2', '1', 'm1'),
      rec('3', '2', 'user'), // rewound prompt
      a('4', '3', 'm2'),
      rec('5', '2', 'user'), // second rewound prompt
      rec('6', '2', 'user'), // the active edit
      a('7', '6', 'm3'),
    ]
    const b = computeBranching(rs)
    expect([...b.active].sort()).toEqual(['1', '2', '6', '7'])
    expect(b.abandoned.map((g) => g.map((r) => r.uuid))).toEqual([['3', '4'], ['5']])
  })

  it('crosses compact boundaries through logicalParentUuid', () => {
    const rs = [
      rec('1', null, 'user'),
      a('2', '1', 'm1'),
      rec('3', null, 'system', { subtype: 'compact_boundary', logicalParentUuid: '2' }),
      rec('4', '3', 'user'),
    ]
    expect(computeBranching(rs).active.size).toBe(4)
  })

  it('dedupes uuids keeping the first and survives cycles', () => {
    const rs = [rec('1', '2', 'user'), rec('2', '1', 'user'), rec('1', null, 'user', { copy: true })]
    const b = computeBranching(rs)
    expect(b.duplicates.size).toBe(1)
    expect(b.byUuid.get('1')?.copy).toBeUndefined()
    expect(b.active.size).toBe(2)
  })
})
