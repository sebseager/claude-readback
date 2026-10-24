import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryStore } from '@/lib/store/db'
import { TranscriptService } from '@/workers/service'
import { App } from './App'
import { setTranscriptApi } from './sessionStore'
import { useUiStore } from './store'

beforeEach(() => {
  setTranscriptApi(new TranscriptService(new MemoryStore()))
})

describe('App shell', () => {
  it('renders the empty state and privacy line', async () => {
    render(<App />)
    expect(await screen.findByText('Drop a Claude Code session to begin')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /choose files/i })).toBeInTheDocument()
    expect(screen.getAllByText('Runs entirely in your browser. Nothing is uploaded.').length).toBeGreaterThan(
      0,
    )
  })

  it('collapses the sidebar', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(useUiStore.getState().sidebarCollapsed).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }))
    expect(useUiStore.getState().sidebarCollapsed).toBe(false)
  })

  it('shows the drop overlay while dragging files and forwards dropped files', async () => {
    const handler = vi.fn()
    render(<App />)
    // App installs the ingest handler on mount; replace it for this test.
    act(() => useUiStore.getState().setFilesHandler(handler))
    const file = new File(['{}\n'], 'session.jsonl')
    const dataTransfer = { types: ['Files'], files: [file], dropEffect: 'none' }
    fireEvent.dragEnter(window, { dataTransfer })
    fireEvent.dragEnter(window, { dataTransfer })
    expect(screen.getByTestId('drop-overlay')).toBeInTheDocument()
    fireEvent.dragLeave(window, { dataTransfer })
    expect(screen.getByTestId('drop-overlay')).toBeInTheDocument()
    fireEvent.drop(window, { dataTransfer })
    expect(screen.queryByTestId('drop-overlay')).not.toBeInTheDocument()
    await waitFor(() => expect(handler).toHaveBeenCalledWith([file]))
  })
})
