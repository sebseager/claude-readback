import type { PromptSegment } from '@/lib/transcript/types'
import { hasPromptBody, promptBody } from '../util'

const pasted = (index: number): PromptSegment => ({
  kind: 'pasted',
  id: `p${index}`,
  index,
  lines: 1,
  text: 'a\nb',
})
const text = (t: string): PromptSegment => ({ kind: 'text', text: t })

describe('promptBody', () => {
  it('collapses the newlines Claude Code puts around a paste to one line break', () => {
    expect(promptBody([text('this is what I have\n\n\n\n'), pasted(1), text('\n')])).toEqual([
      { kind: 'text', text: 'this is what I have\n' },
      pasted(1),
    ])
  })
  it('keeps a single space when the paste sits mid-line', () => {
    expect(promptBody([text('see '), pasted(1), text(' please')])).toEqual([
      { kind: 'text', text: 'see ' },
      pasted(1),
      { kind: 'text', text: ' please' },
    ])
  })
  it('keeps whitespace-only text between two pastes as a separator', () => {
    expect(promptBody([pasted(1), text('\n\n'), pasted(2)])).toEqual([
      pasted(1),
      { kind: 'text', text: '\n' },
      pasted(2),
    ])
    expect(promptBody([pasted(1), text(''), pasted(2)])).toEqual([pasted(1), pasted(2)])
  })
  it('skips images, documents and reminders and trims the ends', () => {
    expect(
      promptBody([
        { kind: 'image', mediaType: 'image/png', base64: '' },
        text('  hi  '),
        { kind: 'system-reminder', text: 'r' },
      ]),
    ).toEqual([{ kind: 'text', text: 'hi' }])
  })
})

describe('hasPromptBody', () => {
  it('is true for prose or a paste, false for attachments only', () => {
    expect(hasPromptBody([text('  \n')])).toBe(false)
    expect(hasPromptBody([pasted(1)])).toBe(true)
    expect(hasPromptBody([{ kind: 'image', mediaType: 'image/png', base64: '' }])).toBe(false)
  })
})
