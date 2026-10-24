import { createContext, useContext } from 'react'

/**
 * The element that scrolls the chat (ChatArea's <main>). `undefined` = no provider, so MessageList
 * renders its own scroll container; `null` = provider mounted but the element isn't attached yet.
 */
export const ChatScrollContext = createContext<HTMLElement | null | undefined>(undefined)

export function useChatScrollElement(): HTMLElement | null | undefined {
  return useContext(ChatScrollContext)
}
