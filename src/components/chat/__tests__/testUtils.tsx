import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { Session } from '@/lib/transcript/types'
import { ChatContext, createRawLookup } from '../chatContext'
import { useChatStore } from '../chatStore'

export function resetChatStore() {
  useChatStore.setState({
    expanded: {},
    searchQuery: '',
    activeMatch: null,
    showHiddenContextDefault: false,
    hiddenContextOverrides: {},
  })
}

export function renderInChat(ui: ReactElement, session: Session) {
  return render(
    <TooltipProvider>
      <ChatContext.Provider value={{ session, ...createRawLookup(session) }}>{ui}</ChatContext.Provider>
    </TooltipProvider>,
  )
}

export function mockClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  return writeText
}
