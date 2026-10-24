import { createContext, useContext, type ReactNode } from 'react'
import type { RawRecord, Session, SubagentRef } from '@/lib/transcript/types'

export interface ChatContextValue {
  session: Session
  /** Storage key of a nested subagent transcript (search hits carry it); undefined for the main session. */
  fileKey?: string
  /** Raw record for a 0-based line of the main file. */
  getRaw: (line: number) => RawRecord | undefined
  /** Line of the record with this uuid (prompts only carry `recordUuid`). */
  findLineByUuid: (uuid: string) => number | undefined
  /** Open a subagent transcript in its own view (optional). */
  onOpenSubagent?: (ref: SubagentRef) => void
  /** Render a nested subagent transcript inside its SubagentCard (optional). */
  renderSubagentTranscript?: (ref: SubagentRef) => ReactNode
}

export const ChatContext = createContext<ChatContextValue | null>(null)

/** Null outside a MessageList (components then hide raw-JSON actions). */
export function useChatContext(): ChatContextValue | null {
  return useContext(ChatContext)
}

/** Default lookups over `session.raw`, built lazily on first use. */
export function createRawLookup(session: Session): Pick<ChatContextValue, 'getRaw' | 'findLineByUuid'> {
  let byLine: Map<number, RawRecord> | undefined
  let byUuid: Map<string, number> | undefined
  const build = () => {
    byLine = new Map()
    byUuid = new Map()
    for (const r of session.raw) {
      byLine.set(r.line, r)
      if (r.uuid) byUuid.set(r.uuid, r.line)
    }
  }
  return {
    getRaw: (line) => {
      if (!byLine) build()
      return byLine!.get(line)
    },
    findLineByUuid: (uuid) => {
      if (!byUuid) build()
      return byUuid!.get(uuid)
    },
  }
}
