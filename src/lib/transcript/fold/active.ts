// §12.1 step 3: the active branch (leaf walk + sibling closure) and abandoned branches.
import type { RawRecord } from '../types'
import { arr, get, isObj, str } from '../util'

export interface Branching {
  /** uuid → first record with that uuid. */
  byUuid: Map<string, RawRecord>
  /** Records whose uuid was already seen (continued-in copies, duplicates). Raw view only. */
  duplicates: Set<RawRecord>
  /** uuids on the active branch. */
  active: Set<string>
  /** Leftover uuid records grouped by branch root, in file order of the root. */
  abandoned: RawRecord[][]
  leafUuid?: string
}

export const msgId = (r: RawRecord): string | undefined => str(get(r, 'message', 'id'))

export const isToolResultRecord = (r: RawRecord): boolean => {
  if (r.type !== 'user') return false
  const blocks = arr(get(r, 'message', 'content'))
  return !!blocks && blocks.some((b) => isObj(b) && b.type === 'tool_result')
}

/** Records that ride along with an active parent even when the leaf walk skips them (§12.1 3a-d). */
const closureCandidate = (r: RawRecord, activeMsgIds: Set<string>): 'yes' | 'no' | 'needs-msg' => {
  switch (r.type) {
    case 'attachment':
    case 'system':
      return 'yes'
    case 'user':
      return isToolResultRecord(r) || r.isMeta === true ? 'yes' : 'no'
    case 'assistant': {
      const m = msgId(r)
      if (!m) return 'no'
      return activeMsgIds.has(m) ? 'yes' : 'needs-msg'
    }
    default:
      return 'no'
  }
}

export function computeBranching(records: readonly RawRecord[]): Branching {
  const byUuid = new Map<string, RawRecord>()
  const duplicates = new Set<RawRecord>()
  const children = new Map<string, RawRecord[]>()
  let leaf: RawRecord | undefined
  for (const r of records) {
    const u = r.uuid
    if (typeof u !== 'string' || u === '') continue
    if (byUuid.has(u)) {
      duplicates.add(r)
      continue
    }
    byUuid.set(u, r)
    leaf = r
    const p = r.parentUuid
    if (typeof p === 'string') {
      const list = children.get(p)
      if (list) list.push(r)
      else children.set(p, [r])
    }
  }

  const active = new Set<string>()
  const activeMsgIds = new Set<string>()
  const queue: string[] = []
  const add = (r: RawRecord) => {
    const u = r.uuid as string
    if (active.has(u)) return false
    active.add(u)
    queue.push(u)
    if (r.type === 'assistant') {
      const m = msgId(r)
      if (m) activeMsgIds.add(m)
    }
    return true
  }

  // Leaf walk. At a compact_boundary (parentUuid null) continue from logicalParentUuid.
  let cur = leaf
  while (cur) {
    if (!add(cur)) break
    const p = typeof cur.parentUuid === 'string' ? cur.parentUuid : str(cur.logicalParentUuid)
    cur = p ? byUuid.get(p) : undefined
  }

  // Sibling closure (BFS over children of active records). Assistant records whose message.id is not
  // active yet wait in `pending` until some record of that message becomes active.
  const pending = new Map<string, RawRecord[]>()
  const flush = (m: string | undefined) => {
    if (!m) return
    const waiting = pending.get(m)
    if (!waiting) return
    pending.delete(m)
    for (const w of waiting) add(w)
  }
  for (let qi = 0; qi < queue.length; qi++) {
    const u = queue[qi]
    const self = byUuid.get(u)
    if (self?.type === 'assistant') flush(msgId(self))
    const kids = children.get(u)
    if (!kids) continue
    for (const k of kids) {
      if (active.has(k.uuid as string)) continue
      const verdict = closureCandidate(k, activeMsgIds)
      if (verdict === 'yes') add(k)
      else if (verdict === 'needs-msg') {
        const m = msgId(k) as string
        const list = pending.get(m)
        if (list) list.push(k)
        else pending.set(m, [k])
      }
    }
  }

  // Leftovers → branches grouped by their topmost leftover ancestor.
  const rootOf = new Map<string, string>()
  const groups = new Map<string, RawRecord[]>()
  for (const r of byUuid.values()) {
    const u = r.uuid as string
    if (active.has(u)) continue
    const p = typeof r.parentUuid === 'string' ? r.parentUuid : undefined
    const root = p && !active.has(p) && rootOf.has(p) ? (rootOf.get(p) as string) : u
    rootOf.set(u, root)
    const g = groups.get(root)
    if (g) g.push(r)
    else groups.set(root, [r])
  }
  // byUuid iterates in file order, so each group (and the group order) is file order too.
  return { byUuid, duplicates, active, abandoned: [...groups.values()], leafUuid: leaf?.uuid }
}
