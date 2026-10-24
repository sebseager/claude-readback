// Rehype plugin: wraps case-insensitive matches of a query in <mark>, across the whole rendered tree.
// Counts matches in document order so the `activeIndex`-th one can be ringed.
import type { Options } from 'react-markdown'
import { MARK_ACTIVE_CLASS, MARK_CLASS, markWindow, searchRegExp } from '@/components/common/highlight'

type HText = { type: 'text'; value: string }
type HElement = {
  type: 'element'
  tagName: string
  properties: Record<string, unknown>
  children: HNode[]
}
type HNode = HText | HElement | { type: string; children?: HNode[]; value?: string }
type HParent = { children: HNode[] }

export type Pluggable = NonNullable<Options['rehypePlugins']>[number]

export interface SearchHighlightOptions {
  query: string
  activeIndex?: number
}

const isElement = (n: HNode): n is HElement => n.type === 'element'
const isText = (n: HNode): n is HText => n.type === 'text'

export function hastToString(n: unknown): string {
  const node = n as HNode
  if (isText(node)) return node.value
  if ('children' in node && node.children) return node.children.map(hastToString).join('')
  return ''
}

function rehypeSearchHighlightPlugin(options: SearchHighlightOptions) {
  return (tree: HParent) => {
    const re = searchRegExp(options.query)
    if (!re) return
    let counter = 0
    // Every match counts (so the active one is the right one); only a window of them becomes a <mark>.
    const [from, to] = markWindow(options.activeIndex)
    const walk = (parent: HParent) => {
      const out: HNode[] = []
      let changed = false
      for (const child of parent.children) {
        if (isText(child)) {
          const value = child.value
          re.lastIndex = 0
          let last = 0
          let m: RegExpExecArray | null
          let pieces: HNode[] | null = null
          while ((m = re.exec(value))) {
            if (m[0].length === 0) {
              re.lastIndex++
              continue
            }
            const index = counter++
            if (index < from || index >= to) continue
            pieces ??= []
            if (m.index > last) pieces.push({ type: 'text', value: value.slice(last, m.index) })
            const active = index === options.activeIndex
            pieces.push({
              type: 'element',
              tagName: 'mark',
              properties: {
                className: active ? `${MARK_CLASS} ${MARK_ACTIVE_CLASS}` : MARK_CLASS,
                ...(active ? { dataSearchActive: '' } : {}),
              },
              children: [{ type: 'text', value: m[0] }],
            })
            last = m.index + m[0].length
          }
          if (pieces) {
            if (last < value.length) pieces.push({ type: 'text', value: value.slice(last) })
            out.push(...pieces)
            changed = true
          } else out.push(child)
          continue
        }
        if (isElement(child)) {
          walk(child)
        } else if ('children' in child && child.children) {
          walk(child as HParent)
        }
        out.push(child)
      }
      if (changed) parent.children = out
    }
    walk(tree)
  }
}

export const rehypeSearchHighlight = rehypeSearchHighlightPlugin as unknown as Pluggable
