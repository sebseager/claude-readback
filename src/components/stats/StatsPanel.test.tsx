import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useUiStore } from '@/app/store'
import { STATS_OVERLAY_QUERY, StatsPanel } from '@/components/layout/StatsPanel'
import { TooltipProvider } from '@/components/ui/tooltip'
import { foldSession, parseJsonl } from '@/lib/transcript'
import { FORK_ID, SUBAGENT_ID, fixtures } from '@/test/fixtures'

const main = () => foldSession(parseJsonl(fixtures.main.text).records)
const subs = () => [
  foldSession(parseJsonl(fixtures.agent.text).records, { agentId: SUBAGENT_ID }),
  foldSession(parseJsonl(fixtures.fork.text).records, { agentId: FORK_ID }),
]
const ui = (node: React.ReactNode) => render(<TooltipProvider>{node}</TooltipProvider>)
const card = (name: string) => screen.getByRole('region', { name })

describe('StatsPanel', () => {
  beforeEach(() => useUiStore.setState({ statsPanelOpen: true }))

  it('shows skeleton placeholders without a session', () => {
    ui(<StatsPanel />)
    expect(screen.getByRole('heading', { name: 'Totals' })).toBeInTheDocument()
    expect(screen.queryByText('Turns')).not.toBeInTheDocument()
  })

  it('renders the folded fixture', async () => {
    ui(<StatsPanel session={main()} />)
    const totals = card('Totals')
    expect(within(totals).getByText('Turns').previousSibling).toHaveTextContent('7')
    expect(within(totals).getByText('Messages').previousSibling).toHaveTextContent('21')
    expect(within(totals).getByText(/2 failed/)).toBeInTheDocument()
    expect(within(totals).getByText('1m 6s')).toBeInTheDocument() // 65.8s wall
    expect(within(totals).getByText('5.1s')).toBeInTheDocument() // thinking

    const tokens = card('Tokens')
    expect(within(tokens).getByText('378k')).toBeInTheDocument()
    expect(within(tokens).getByText('≥1.7k')).toBeInTheDocument() // output is a lower bound
    expect(within(tokens).getByText('94%')).toBeInTheDocument() // cache hit rate

    const cost = card('Cost')
    expect(within(cost).getAllByText('$0.42')).toHaveLength(2) // total + Opus row
    expect(within(cost).getByText('$0.0012')).toBeInTheDocument()
    expect(within(cost).getByText('from Claude Code cost-state')).toBeInTheDocument()
    expect(within(cost).getByText('Opus 5.5')).toBeInTheDocument()
    expect(within(cost).getByText('Haiku 5.5')).toBeInTheDocument()

    const tools = card('Tools')
    expect(within(tools).getByText('17 calls')).toBeInTheDocument()
    expect(within(tools).getByLabelText('2 failed')).toBeInTheDocument()
    expect(within(tools).getAllByRole('listitem')).toHaveLength(8)

    expect(within(card('Models')).getByText('21 msgs')).toBeInTheDocument()
    // The chart (recharts) is lazy-loaded behind a skeleton.
    await waitFor(
      () => expect(within(card('Context over time')).getByText(/compaction/)).toBeInTheDocument(),
      {
        timeout: 5000,
      },
    )
    const pace = card('Pace')
    expect(within(pace).getByText('400ms', { selector: 'dd' })).toBeInTheDocument()
    expect(within(pace).getByText(/before turn 6/)).toBeInTheDocument() // the rewound prompt
    expect(screen.queryByText(/Include subagents/)).not.toBeInTheDocument()
  })

  it('expands the tool list', async () => {
    ui(<StatsPanel session={main()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Show all 12' }))
    expect(within(card('Tools')).getAllByRole('listitem')).toHaveLength(12)
  })

  it('toggles subagent usage', async () => {
    ui(<StatsPanel session={main()} subagentSessions={subs()} />)
    const toggle = screen.getByRole('switch', { name: /Include subagents/ })
    expect(toggle).toBeChecked()
    expect(within(card('Tools')).getByText('19 calls')).toBeInTheDocument()
    expect(within(card('Cost')).getByText('Already includes subagent usage.')).toBeInTheDocument()
    await userEvent.click(toggle)
    expect(toggle).not.toBeChecked()
    expect(within(card('Tools')).getByText('17 calls')).toBeInTheDocument()
  })

  it('is a right-side sheet over the chat below 1024px', async () => {
    const original = window.matchMedia
    window.matchMedia = ((query: string) => ({
      ...original(query),
      matches: query === STATS_OVERLAY_QUERY,
    })) as typeof window.matchMedia
    try {
      ui(<StatsPanel session={main()} />)
      const dialog = await screen.findByRole('dialog', { name: 'Session stats' })
      expect(within(dialog).getByRole('region', { name: 'Totals' })).toBeInTheDocument()
      await userEvent.click(within(dialog).getByRole('button', { name: 'Close stats' }))
      expect(useUiStore.getState().statsPanelOpen).toBe(false)
    } finally {
      window.matchMedia = original
    }
  })
})
