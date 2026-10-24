import { fireEvent, render, screen, within } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { foldSession } from '@/lib/transcript/fold'
import { parseJsonl } from '@/lib/transcript/parse'
import type { RawRecord, ToolBlock } from '@/lib/transcript/types'
import { fixtures } from '@/test/fixtures'
import { RawJsonDialog } from '../RawJsonDialog'
import { ToolCard } from '../tool/ToolCard'
import { renderInChat, resetChatStore } from './testUtils'

beforeEach(resetChatStore)

describe('raw JSON for tool cards', () => {
  const session = foldSession(parseJsonl(fixtures.main.text).records)
  const tool = session.turns
    .flatMap((t) => t.items)
    .flatMap((i) => (i.kind === 'assistant' ? i.blocks : []))
    .find((b): b is ToolBlock => b.kind === 'tool' && !!b.result && b.attachments.length === 0)!

  it('shows the tool_use record and the tool_result record', () => {
    renderInChat(<ToolCard block={tool} />, session)
    fireEvent.click(screen.getByRole('button', { name: 'View raw JSON' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/2 records · lines/)).toHaveTextContent(
      `lines ${tool.recordLine! + 1}, ${tool.result!.recordLine + 1}`,
    )
    const pre = dialog.querySelector('pre')!
    expect(pre.textContent).toContain('"type": "tool_use"')
    expect(pre.textContent).toContain('"type": "tool_result"')
  })
})

describe('RawJsonDialog', () => {
  it('elides base64 payloads and cuts giant strings', () => {
    const record: RawRecord = {
      line: 0,
      type: 'user',
      message: { content: [{ type: 'image', source: { data: 'A'.repeat(50_000) } }] },
      toolUseResult: { stdout: 'x'.repeat(150_000) },
    }
    render(
      <TooltipProvider>
        <RawJsonDialog open onOpenChange={() => {}} records={[record]} />
      </TooltipProvider>,
    )
    const text = screen.getByRole('dialog').querySelector('pre')!.textContent!
    expect(text).toContain('[base64, 49 KB omitted]')
    expect(text).not.toContain('A'.repeat(1000))
    expect(text).toContain('more omitted')
    expect(text.length).toBeLessThan(110_000)
  })
})
