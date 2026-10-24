import { render, screen, waitFor, within } from '@testing-library/react'
import { fakeLayout } from '@/test/layout'
import { SYNTHETIC_SESSION_ID } from '@/test/fixtures'
import { resetSessionStore, syntheticFiles } from '@/test/sessions'
import { App } from './App'
import { emitFiles } from './store'
import { useSessionStore } from './sessionStore'

let restore: () => void
beforeAll(() => {
  restore = fakeLayout()
})
afterAll(() => restore())
beforeEach(() => {
  resetSessionStore()
})

describe('App with the synthetic session', () => {
  it('ingests dropped files through the worker fallback and renders the conversation', async () => {
    render(<App />)
    expect(await screen.findByText('Drop a Claude Code session to begin')).toBeInTheDocument()

    emitFiles(syntheticFiles())

    // Sidebar row, header title and the first prompt in the message list.
    const row = await screen.findByTestId('session-row', {}, { timeout: 3000 })
    expect(row).toHaveAttribute('data-session-id', SYNTHETIC_SESSION_ID)
    const title = useSessionStore.getState().activeSession!.summary.title
    expect(within(row).getByText(title)).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByTestId('message-list')).toHaveTextContent('Add a word-count command to @src/cli.py'),
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(title)
    expect(screen.queryByText('Drop a Claude Code session to begin')).not.toBeInTheDocument()
  })

  it('reopens the stored library on the next load', async () => {
    await useSessionStore.getState().ingestFiles(syntheticFiles())
    // Simulate a reload: same backend, fresh view state.
    useSessionStore.setState({
      activeSessionId: null,
      activeSession: undefined,
      sessions: [],
      listLoaded: false,
    })
    render(<App />)
    await waitFor(() =>
      expect(screen.getByTestId('message-list')).toHaveTextContent('Add a word-count command to @src/cli.py'),
    )
    expect(screen.getAllByTestId('session-row')).toHaveLength(1)
  })
})
