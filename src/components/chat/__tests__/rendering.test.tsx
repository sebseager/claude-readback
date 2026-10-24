import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { buildMockSession } from '@/lib/transcript/mock'
import type { AssistantItem, ToolBlock } from '@/lib/transcript/types'
import { AssistantFooter } from '../AssistantFooter'
import { useChatStore } from '../chatStore'
import { Markdown } from '../Markdown'
import { RowRenderer } from '../RowRenderer'
import { buildRows } from '../rows'
import { ThinkingBlock } from '../ThinkingBlock'
import { ToolCard } from '../tool/ToolCard'
import { UserPromptRow } from '../UserPromptRow'
import { mockClipboard, renderInChat, resetChatStore } from './testUtils'

const session = buildMockSession()
const assistantItems = session.turns
  .flatMap((t) => t.items)
  .filter((i): i is AssistantItem => i.kind === 'assistant')
const tools = assistantItems.flatMap((i) => i.blocks).filter((b): b is ToolBlock => b.kind === 'tool')
const toolById = (id: string) => tools.find((t) => t.id === id)!

beforeEach(resetChatStore)

describe('row rendering', () => {
  it('renders every row of the mock session', () => {
    const { rows } = buildRows(session)
    renderInChat(
      <div>
        {rows.map((r) => (
          <RowRenderer key={r.id} row={r} />
        ))}
      </div>,
      session,
    )
    for (const id of [
      'user-prompt',
      'queued-user',
      'slash-command',
      'task-notification',
      'agent-message',
      'compact-summary',
      'meta',
      'assistant-row',
      'event-chip',
      'compaction',
      'abandoned-branch',
      'hidden-context',
      'interrupted',
      'tool-card',
      'thinking',
      'fallback-block',
      'unknown-block',
    ]) {
      expect(screen.getAllByTestId(id).length, id).toBeGreaterThan(0)
    }
    const categories = new Set(screen.getAllByTestId('event-chip').map((e) => e.dataset.category))
    expect(categories.size).toBeGreaterThanOrEqual(12)
  })

  it('shows the queued badge and the slash command', () => {
    const { rows } = buildRows(session)
    renderInChat(
      <div>
        {rows.map((r) => (
          <RowRenderer key={r.id} row={r} />
        ))}
      </div>,
      session,
    )
    expect(screen.getByText('Queued while Claude was working')).toBeInTheDocument()
    expect(screen.getByText('/model claude-fable-5-1')).toBeInTheDocument()
  })
})

describe('user prompt', () => {
  it('opens a pasted block in a dialog with its text and a working Copy button', async () => {
    const writeText = mockClipboard()
    renderInChat(<UserPromptRow turn={session.turns[0]} />, session)
    fireEvent.click(screen.getByRole('button', { name: /Pasted text #1/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Pasted text #1')).toBeInTheDocument()
    expect(dialog.textContent).toContain("import { getConfig } from '../config'")
    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy' }))
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('export class ForecastError')),
    )
  })

  it('labels the chip with the line count and keeps reminders out of the bubble', () => {
    renderInChat(<UserPromptRow turn={session.turns[0]} />, session)
    expect(screen.getByRole('button', { name: /Pasted text #1 · \+60 lines/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /system reminder/ })).toBeInTheDocument()
    expect(screen.queryByText(/opened the file src\/api\/forecast.ts in the IDE/)).not.toBeInTheDocument()
    expect(screen.getByText('@src/api/forecast.ts')).toBeInTheDocument()
  })
})

describe('tool card', () => {
  it('is collapsed by default and toggles with click and keyboard', () => {
    renderInChat(<ToolCard block={toolById('toolu_bash_1')} />, session)
    const header = screen.getByRole('button', { name: /Bash/ })
    expect(header).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Input')).not.toBeInTheDocument()
    fireEvent.click(header)
    expect(header).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Input')).toBeInTheDocument()
    expect(screen.getByText('pnpm vitest run src/api')).toBeInTheDocument()
    expect(screen.getByTestId('terminal-pane').textContent).toContain('10 passed')
    fireEvent.click(header)
    expect(header).toHaveAttribute('aria-expanded', 'false')
  })

  it('expands errors by default and shows stderr with the exit code', () => {
    renderInChat(<ToolCard block={toolById('toolu_bash_2')} />, session)
    expect(screen.getByRole('button', { name: /Bash/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('exit 2')).toBeInTheDocument()
    expect(screen.getByText(/TS2322/)).toBeInTheDocument()
  })

  it('expands denials by default with the reason', () => {
    renderInChat(<ToolCard block={toolById('toolu_bash_rm')} />, session)
    expect(screen.getByText(/The user rejected this command/)).toBeInTheDocument()
    expect(screen.getAllByText('denied').length).toBeGreaterThan(0)
  })

  it('renders an Edit result as a diff and the pending state', () => {
    useChatStore.getState().setExpanded('toolu_edit_1', true)
    const { unmount } = renderInChat(<ToolCard block={toolById('toolu_edit_1')} />, session)
    expect(screen.getByText('@@ -36,9 +36,10 @@')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Diagnostics · 1 error/ })).toBeInTheDocument()
    unmount()
    renderInChat(<ToolCard block={toolById('toolu_bash_watch')} />, session)
    expect(screen.getByText('pending')).toBeInTheDocument()
  })

  it('clamps long output and notes persisted output', () => {
    useChatStore.getState().setExpanded('toolu_bash_big', true)
    renderInChat(<ToolCard block={toolById('toolu_bash_big')} />, session)
    expect(screen.getByText(/full output saved to/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show all (120 lines)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument()
  })

  it('shows chosen answers for AskUserQuestion and the subagent placeholder for an un-uploaded agent', () => {
    useChatStore.getState().setExpanded('toolu_ask_1', true)
    useChatStore.getState().setExpanded('toolu_agent_1', true)
    useChatStore.getState().setExpanded('subagent:a91f', true)
    renderInChat(
      <>
        <ToolCard block={toolById('toolu_ask_1')} />
        <ToolCard block={toolById('toolu_agent_1')} />
      </>,
      session,
    )
    const chosen = document.querySelectorAll('[data-chosen]')
    expect([...chosen].map((c) => c.textContent)).toEqual([
      expect.stringContaining('In-memory LRU'),
      '10 minutes',
    ])
    expect(screen.getByText('agent-a91f.jsonl')).toBeInTheDocument()
  })
})

describe('untrusted URLs in tool data', () => {
  it('renders a javascript: WebFetch url and search result as text, not links', () => {
    const fetch = toolById('toolu_fetch_1')
    const search = toolById('toolu_search_1')
    const evilFetch: ToolBlock = {
      ...fetch,
      id: 'evil-fetch',
      input: { url: 'javascript:alert(1)', prompt: 'x' },
    }
    const structured = {
      query: 'q',
      results: [
        {
          content: [
            { title: 'Evil', url: 'javascript:alert(1)' },
            { title: 'Good', url: 'https://example.com/' },
          ],
        },
      ],
    }
    const evilSearch: ToolBlock = { ...search, id: 'evil-search', result: { ...search.result!, structured } }
    useChatStore.getState().setExpanded('evil-fetch', true)
    useChatStore.getState().setExpanded('evil-search', true)
    renderInChat(
      <>
        <ToolCard block={evilFetch} />
        <ToolCard block={evilSearch} />
      </>,
      session,
    )
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(hrefs.some((h) => h?.startsWith('javascript'))).toBe(false)
    expect(hrefs).toContain('https://example.com/')
    expect(screen.getByText('Evil')).toBeInTheDocument()
    expect(screen.getAllByText('javascript:alert(1)').length).toBeGreaterThan(0)
  })
})

describe('thinking', () => {
  const thinking = assistantItems.flatMap((i) => i.blocks).filter((b) => b.kind === 'thinking')

  it('is not expandable when the text was not stored', () => {
    const empty = thinking.find((b) => b.kind === 'thinking' && b.text === '')!
    renderInChat(<ThinkingBlock block={empty as Extract<typeof empty, { kind: 'thinking' }>} />, session)
    expect(screen.getByText('Thought for 4.2s')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('expands to the thinking text when present', () => {
    const full = thinking.find((b) => b.kind === 'thinking' && b.text !== '')!
    renderInChat(<ThinkingBlock block={full as Extract<typeof full, { kind: 'thinking' }>} />, session)
    const button = screen.getByRole('button', { name: /Thought for 12s/ })
    expect(screen.queryByText(/abort/)).not.toBeInTheDocument()
    fireEvent.click(button)
    expect(screen.getByText(/path also has no status/)).toBeInTheDocument()
  })
})

describe('assistant footer', () => {
  it('prefixes output tokens with ≥ when usage is not final', () => {
    const nonFinal = assistantItems.find((i) => i.id === 'msg_mock_a3')!
    renderInChat(<AssistantFooter item={nonFinal} />, session)
    expect(screen.getByTestId('assistant-footer').textContent).toContain('out ≥8')
  })

  it('shows plain counts, tokens formatted, when final', () => {
    const final = assistantItems.find((i) => i.id === 'msg_mock_a4')!
    renderInChat(<AssistantFooter item={final} />, session)
    const text = screen.getByTestId('assistant-footer').textContent ?? ''
    expect(text).toContain('in 5 · cache 30.5k · out 812')
    expect(text).not.toContain('≥')
  })

  it('shows API errors', () => {
    const err = assistantItems.find((i) => i.id === 'msg_mock_err')!
    renderInChat(<AssistantFooter item={err} />, session)
    expect(screen.getByText(/API error 529: Overloaded/)).toBeInTheDocument()
  })
})

describe('markdown', () => {
  it('renders fenced code with a language label and a copy button', async () => {
    const writeText = mockClipboard()
    renderInChat(
      <Markdown markdown={'Intro\n\n```ts\nconst a: number = 1\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |'} />,
      session,
    )
    expect(screen.getByText('typescript')).toBeInTheDocument()
    expect(document.querySelector('.md-table-wrap table')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('const a: number = 1'))
  })

  it('highlights search matches with marks and rings the active one', () => {
    useChatStore.setState({ searchQuery: 'cache' })
    renderInChat(<Markdown markdown={'The **cache** and the cache again'} activeIndex={1} />, session)
    const marks = document.querySelectorAll('mark')
    expect(marks).toHaveLength(2)
    expect(marks[1]).toHaveAttribute('data-search-active')
  })

  it('never renders javascript: or relative markdown links as anchors', () => {
    renderInChat(<Markdown markdown={'[bad](javascript:alert(1)) and [rel](src/a.ts)'} />, session)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('bad')).toBeInTheDocument()
  })

  it('opens links in a new tab', () => {
    renderInChat(<Markdown markdown={'[docs](https://example.com)'} />, session)
    expect(screen.getByRole('link', { name: 'docs' })).toHaveAttribute('target', '_blank')
  })
})

describe('Edit tool card', () => {
  const edit = toolById('toolu_edit_1')

  it('shows only the path and a collapsed strings toggle when the result carries the patch', () => {
    renderInChat(<ToolCard block={edit} />, session)
    fireEvent.click(screen.getAllByRole('button', { expanded: false })[0])
    const toggle = screen.getByRole('button', { name: /old → new strings/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    // One diff in the card: the Result's patch.
    expect(document.querySelectorAll('table').length).toBe(1)
    fireEvent.click(toggle)
    expect(document.querySelectorAll('table').length).toBe(2)
  })

  it('keeps the two-colour old/new diff in Input when there is no patch', () => {
    const noPatch: ToolBlock = { ...edit, id: 'toolu_edit_nopatch', result: undefined }
    renderInChat(<ToolCard block={noPatch} />, session)
    fireEvent.click(screen.getAllByRole('button', { expanded: false })[0])
    expect(screen.queryByRole('button', { name: /old → new strings/ })).not.toBeInTheDocument()
    expect(document.querySelectorAll('table').length).toBe(1)
    expect(document.querySelector('tr.bg-danger\\/10, tr[class*="bg-danger"]')).not.toBeNull()
    expect(document.querySelector('tr[class*="bg-success"]')).not.toBeNull()
  })
})

describe('pasted-only prompts', () => {
  it('render the chip inside the bubble', () => {
    const turn = {
      ...session.turns.find((t) => t.kind === 'human')!,
      id: 'turn-pasted-only',
      prompt: {
        segments: [{ kind: 'pasted' as const, id: 'p9', index: 9, lines: 2, text: 'a\nb\n' }],
        mentions: [],
        rawText: '',
        recordUuid: 'u-pasted-only',
      },
    }
    renderInChat(<UserPromptRow turn={turn} />, session)
    const bubble = screen.getByTestId('user-prompt').querySelector('.bg-bubble')!
    expect(within(bubble as HTMLElement).getByRole('button', { name: /Pasted text #9/ })).toBeInTheDocument()
  })
})

describe('inline pasted chips', () => {
  it('sit in the bubble where the text was pasted, with other attachments above', () => {
    const turn = {
      ...session.turns.find((t) => t.kind === 'human')!,
      id: 'turn-inline',
      prompt: {
        segments: [
          { kind: 'text' as const, text: 'Compare these:\n\n\n' },
          { kind: 'pasted' as const, id: 'a1', index: 1, lines: 1, text: 'x\ny' },
          { kind: 'text' as const, text: '\nand\n' },
          { kind: 'pasted' as const, id: 'b2', index: 2, lines: 0, text: 'z' },
          { kind: 'system-reminder' as const, text: 'reminder body' },
        ],
        mentions: [],
        rawText: '',
        recordUuid: 'u-inline',
      },
    }
    renderInChat(<UserPromptRow turn={turn} />, session)
    const row = screen.getByTestId('user-prompt')
    const bubble = row.querySelector('.bg-bubble') as HTMLElement
    expect(bubble.textContent).toBe(
      'Compare these:\nPasted text #1 · +1 lines\nand\nPasted text #2 · +0 lines',
    )
    const reminder = screen.getByRole('button', { name: /system reminder/ })
    expect(bubble.contains(reminder)).toBe(false)
  })
})
