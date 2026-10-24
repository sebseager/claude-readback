import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useSessionStore } from '@/app/sessionStore'
import { useChatStore } from '@/components/chat/chatStore'
import { TooltipProvider } from '@/components/ui/tooltip'
import { resetChatStore } from '@/components/chat/__tests__/testUtils'
import { SYNTHETIC_SESSION_ID } from '@/test/fixtures'
import { resetSessionStore, syntheticFiles } from '@/test/sessions'
import { MainHeader } from './MainHeader'

const renderHeader = () =>
  render(
    <TooltipProvider>
      <MainHeader />
    </TooltipProvider>,
  )
const counter = () => screen.getByTestId('search-counter').textContent

beforeEach(async () => {
  resetSessionStore()
  resetChatStore()
  await useSessionStore.getState().ingestFiles(syntheticFiles())
})

describe('MainHeader', () => {
  it('shows the session title and meta', () => {
    renderHeader()
    const s = useSessionStore.getState().activeSession!.summary
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(s.title)
    const meta = screen.getByTestId('session-meta')
    expect(meta).toHaveTextContent(s.projectName)
    expect(meta).toHaveTextContent(s.gitBranch!)
    expect(meta).toHaveTextContent('opus-5-5')
    expect(meta).toHaveTextContent('2 subagents')
  })

  it('searches the session and steps through hits with wraparound', async () => {
    renderHeader()
    const box = screen.getByRole('searchbox', { name: 'Search this session' })
    fireEvent.change(box, { target: { value: 'word' } })
    await waitFor(() => expect(counter()).toMatch(/^1\/\d+$/))
    const n = Number(counter()!.split('/')[1])
    expect(n).toBeGreaterThan(2)
    expect(useChatStore.getState().searchQuery).toBe('word')
    const first = useChatStore.getState().activeMatch

    fireEvent.click(screen.getByRole('button', { name: 'Next match (Enter)' }))
    expect(counter()).toBe(`2/${n}`)
    expect(useChatStore.getState().activeMatch).not.toEqual(first)

    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true })
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true })
    expect(counter()).toBe(`${n}/${n}`)
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(counter()).toBe(`1/${n}`)
    expect(useChatStore.getState().activeMatch).toMatchObject({
      rowId: first!.rowId,
      occurrence: first!.occurrence,
    })

    fireEvent.keyDown(box, { key: 'Escape' })
    expect(box).toHaveValue('')
    expect(counter()).toBe('')
    expect(useChatStore.getState().searchQuery).toBe('')
  })

  it('shows 0/0 when nothing matches', async () => {
    renderHeader()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search this session' }), {
      target: { value: 'zzqqxx-no-such-text' },
    })
    await waitFor(() => expect(counter()).toBe('0/0'))
    expect(useChatStore.getState().activeMatch).toBeNull()
  })

  it('focuses the search on ⌘F / Ctrl+F', () => {
    renderHeader()
    const ev = new KeyboardEvent('keydown', { key: 'f', metaKey: true, cancelable: true })
    act(() => {
      window.dispatchEvent(ev)
    })
    expect(ev.defaultPrevented).toBe(true)
    expect(screen.getByRole('searchbox', { name: 'Search this session' })).toHaveFocus()
  })

  it('shows "continued in", enabled only when that session is stored', async () => {
    const s = useSessionStore.getState().activeSession!.summary
    expect(s.sessionId).toBe(SYNTHETIC_SESSION_ID)
    expect(s.continuedInSessionId).toBeDefined()
    renderHeader()
    expect(screen.getByRole('button', { name: /continued in/ })).toBeDisabled()
    act(() =>
      useSessionStore.setState((st) => ({
        sessions: [...st.sessions, { ...s, sessionId: s.continuedInSessionId! }],
      })),
    )
    const link = screen.getByRole('button', { name: /continued in/ })
    expect(link).toBeEnabled()
    fireEvent.click(link)
    expect(useSessionStore.getState().activeSessionId).toBe(s.continuedInSessionId)
  })
})
