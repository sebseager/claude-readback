import { useVirtualizer } from '@tanstack/react-virtual'
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react'
import type { RawRecord, Session, SubagentRef } from '@/lib/transcript/types'
import { cn } from '@/lib/utils'
import { ChatContext, createRawLookup, type ChatContextValue } from './chatContext'
import { useChatStore } from './chatStore'
import { buildRows, type ChatRow, estimateRowSize, rowPadding } from './rows'

/** Rows whose footer (raw action, time) hangs below their box. */
const hasFooter = (row: ChatRow) =>
  row.kind === 'prompt' || (row.kind === 'item' && row.item.kind === 'queued-user')
import { RowRenderer } from './RowRenderer'
import { useChatScrollElement } from './scrollContext'

export type ScrollAlign = 'start' | 'center' | 'end' | 'auto'

export interface MessageListHandle {
  /** Scrolls to a row by row id, block id or hidden-context item id. Returns false when unknown. */
  scrollToRow: (rowId: string, options?: { align?: ScrollAlign }) => boolean
  scrollToTop: () => void
  scrollToBottom: () => void
}

export type MessageListProps = {
  session: Session
  ref?: Ref<MessageListHandle>
  /** Raw record lookup; defaults to `session.raw` by line. */
  getRaw?: (line: number) => RawRecord | undefined
  onOpenSubagent?: (ref: SubagentRef) => void
  renderSubagentTranscript?: (ref: SubagentRef) => ReactNode
  /** Scroll container; defaults to ChatArea's (via context), else the list scrolls itself. */
  scrollElement?: HTMLElement | null
  className?: string
  /**
   * A list rendered inside another one (subagent transcript): it does not reset the shared view state
   * and only follows search hits whose `fileKey` is `fileKey`.
   */
  nested?: boolean
  /** Storage key of this transcript when it is a subagent file (matches `ActiveMatch.fileKey`). */
  fileKey?: string
}

const OVERSCAN = 8

/** Virtualized transcript: turns flattened to rows, dynamically measured. */
export function MessageList({
  session,
  ref,
  getRaw,
  onOpenSubagent,
  renderSubagentTranscript,
  scrollElement,
  className,
  nested = false,
  fileKey,
}: MessageListProps) {
  const ctxScroll = useChatScrollElement()
  const external = scrollElement !== undefined || ctxScroll !== undefined
  const [ownScroll, setOwnScroll] = useState<HTMLDivElement | null>(null)
  const scrollEl: HTMLElement | null = (scrollElement ?? ctxScroll ?? null) || ownScroll

  const { rows, indexById } = useMemo(() => buildRows(session), [session])

  const context = useMemo<ChatContextValue>(() => {
    const lookup = createRawLookup(session)
    return {
      session,
      fileKey: nested ? (fileKey ?? session.summary.sessionId) : undefined,
      getRaw: getRaw ?? lookup.getRaw,
      findLineByUuid: lookup.findLineByUuid,
      onOpenSubagent,
      renderSubagentTranscript,
    }
  }, [session, getRaw, onOpenSubagent, renderSubagentTranscript, nested, fileKey])

  // The list may not start at the top of the scroll container (headers, padding).
  const listRef = useRef<HTMLDivElement>(null)
  const [scrollMargin, setScrollMargin] = useState(0)
  useLayoutEffect(() => {
    const list = listRef.current
    if (!list || !scrollEl) return
    const margin =
      list.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top + scrollEl.scrollTop
    setScrollMargin(Math.max(0, Math.round(margin)))
  }, [scrollEl])

  // oxlint-disable-next-line react/incompatible-library -- the virtualizer is designed to be re-read every render
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollEl,
    estimateSize: (i) => estimateRowSize(rows[i]),
    getItemKey: (i) => rows[i]?.id ?? i,
    overscan: OVERSCAN,
    scrollMargin,
  })

  const scrollToRow = useCallback(
    (rowId: string, options?: { align?: ScrollAlign }) => {
      const index = indexById.get(rowId)
      if (index === undefined) return false
      virtualizer.scrollToIndex(index, { align: options?.align ?? 'start' })
      return true
    },
    [indexById, virtualizer],
  )

  useImperativeHandle(
    ref,
    () => ({
      scrollToRow,
      scrollToTop: () => virtualizer.scrollToOffset(0),
      scrollToBottom: () => rows.length && virtualizer.scrollToIndex(rows.length - 1, { align: 'end' }),
    }),
    [scrollToRow, virtualizer, rows.length],
  )

  // Fresh view state per session.
  const resetView = useChatStore((s) => s.resetView)
  const sessionId = session.summary.sessionId
  useEffect(() => {
    if (!nested) resetView()
  }, [sessionId, resetView, nested])

  useSearchJump(scrollToRow, indexById, rows, session, nested ? (fileKey ?? sessionId) : undefined)

  const items = virtualizer.getVirtualItems()
  const list = (
    <div
      ref={listRef}
      className={cn('mx-auto w-full max-w-3xl px-6 pt-6 pb-24', className)}
      data-testid="message-list"
    >
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {items.map((v) => {
          const row = rows[v.index]
          return (
            <div
              key={v.key}
              data-index={v.index}
              data-row-id={row.id}
              data-row-kind={row.kind}
              ref={virtualizer.measureElement}
              className={cn(
                'absolute top-0 left-0 w-full',
                rowPadding(rows, v.index),
                // Prompt rows hang a footer into the gap below; the transform makes each wrapper its own
                // stacking context, so lift these above the next row or it swallows the clicks.
                hasFooter(row) && 'z-10',
              )}
              style={{ transform: `translateY(${v.start - scrollMargin}px)` }}
            >
              <RowRenderer row={row} />
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <ChatContext.Provider value={context}>
      {external ? (
        list
      ) : (
        <div ref={setOwnScroll} className="scrollbar-thin h-full overflow-y-auto">
          {list}
        </div>
      )}
    </ChatContext.Provider>
  )
}

/** On every search navigation: expand the containing card, scroll the row in, then centre the mark. */
function useSearchJump(
  scrollToRow: (rowId: string, options?: { align?: ScrollAlign }) => boolean,
  indexById: Map<string, number>,
  rows: ReturnType<typeof buildRows>['rows'],
  session: Session,
  /** Nested lists: the fileKey whose hits they follow. Undefined for the top-level list. */
  ownFileKey: string | undefined,
) {
  const activeMatch = useChatStore((s) => s.activeMatch)
  useEffect(() => {
    if (!activeMatch) return
    const { setExpanded, setHiddenContextShown } = useChatStore.getState()
    if (activeMatch.fileKey !== ownFileKey) {
      // Hit inside a subagent transcript: open the Agent card that hosts it; the nested list does the rest
      // (subagents of subagents are found one level at a time).
      if (activeMatch.fileKey === undefined) return
      const host = findSubagentHost(session, activeMatch.fileKey)
      if (!host) return
      setExpanded(host.blockId, true)
      setExpanded(`subagent:${host.agentId}`, true)
      scrollToRow(host.rowId, { align: 'start' })
      return
    }
    // Hidden-context hits carry the turn id as row id; their own row is aliased by the item id.
    const ctxItem = activeMatch.blockId?.startsWith('ctx:') ? activeMatch.blockId.slice(4) : undefined
    const index =
      (ctxItem !== undefined ? indexById.get(ctxItem) : undefined) ??
      indexById.get(activeMatch.rowId) ??
      (activeMatch.blockId ? indexById.get(activeMatch.blockId) : undefined)
    if (index === undefined) return
    const row = rows[index]
    if (activeMatch.blockId) setExpanded(activeMatch.blockId, true)
    if (row.kind === 'hidden-context-toggle') setHiddenContextShown(row.turnId, true)
    else if (row.kind === 'prompt' && row.turn.kind !== 'human') setExpanded(row.id, true)
    else if (row.kind === 'item' && row.item.kind !== 'assistant') setExpanded(row.id, true)
    scrollToRow(row.id, { align: 'center' })
    let frame = 0
    let tries = 0
    const centreMark = () => {
      const el = document.querySelector(`[data-row-id="${cssEscape(row.id)}"] [data-search-active]`)
      if (el) el.scrollIntoView({ block: 'center' })
      else if (tries++ < 10) frame = requestAnimationFrame(centreMark)
    }
    frame = requestAnimationFrame(centreMark)
    return () => cancelAnimationFrame(frame)
  }, [activeMatch, indexById, rows, scrollToRow, session, ownFileKey])
}

/** The Agent tool block whose subagent transcript is stored under `fileKey`. */
function findSubagentHost(
  session: Session,
  fileKey: string,
): { rowId: string; blockId: string; agentId: string } | undefined {
  for (const turn of session.turns)
    for (const item of turn.items) {
      if (item.kind !== 'assistant') continue
      for (const b of item.blocks)
        if (b.kind === 'tool' && b.subagent?.fileKey === fileKey)
          return { rowId: item.id, blockId: b.id, agentId: b.subagent.agentId }
    }
  return undefined
}

const cssEscape = (s: string) =>
  typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(s) : s.replace(/["\\]/g, '\\$&')
