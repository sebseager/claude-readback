import {
  cleanHandback,
  detectInterrupt,
  mentionFromAttachment,
  newPasteCounter,
  parseAgentMessage,
  parseCommandOutput,
  parseCommandTags,
  parsePromptContent,
  parsePromptText,
  parseTaskNotification,
  promptPreview,
} from './prompt'

describe('parsePromptText', () => {
  it('returns one text segment for plain prompts', () => {
    expect(parsePromptText('hello\nworld', newPasteCounter())).toEqual([
      { kind: 'text', text: 'hello\nworld' },
    ])
  })

  it('extracts pasted blocks whose closing tag carries the id', () => {
    const c = newPasteCounter()
    const segs = parsePromptText(
      'look:\n<pasted_content id="f40d">\nL1\nL2\nL3\n</pasted_content id="f40d">\nthanks',
      c,
    )
    expect(segs).toEqual([
      { kind: 'text', text: 'look:\n' },
      { kind: 'pasted', id: 'f40d', index: 1, lines: 2, text: 'L1\nL2\nL3' },
      { kind: 'text', text: '\nthanks' },
    ])
    expect(c.n).toBe(1)
  })

  it('continues the counter across prompts and reuses of the same id', () => {
    const c = newPasteCounter()
    parsePromptText('<pasted_content id="aa">\nx\n</pasted_content id="aa">', c)
    const segs = parsePromptText('<pasted_content id="aa">\ny\nz\n</pasted_content id="aa">', c)
    expect(segs).toEqual([{ kind: 'pasted', id: 'aa', index: 2, lines: 1, text: 'y\nz' }])
  })

  it('tolerates a plain closing tag and a paste that contains a different closing tag', () => {
    const c = newPasteCounter()
    expect(parsePromptText('<pasted_content id="b1">\nhi\n</pasted_content>', c)).toEqual([
      { kind: 'pasted', id: 'b1', index: 1, lines: 0, text: 'hi' },
    ])
    const nested = parsePromptText(
      '<pasted_content id="b2">\na </pasted_content> b\n</pasted_content id="b2">',
      c,
    )
    expect(nested).toEqual([{ kind: 'pasted', id: 'b2', index: 2, lines: 0, text: 'a </pasted_content> b' }])
  })

  it('keeps an unterminated paste as text', () => {
    const segs = parsePromptText('x <pasted_content id="zz">\nnever closed', newPasteCounter())
    expect(segs).toEqual([{ kind: 'text', text: 'x <pasted_content id="zz">\nnever closed' }])
  })

  it('splits out system reminders', () => {
    expect(parsePromptText('a<system-reminder>\nsecret\n</system-reminder>b', newPasteCounter())).toEqual([
      { kind: 'text', text: 'a' },
      { kind: 'system-reminder', text: 'secret' },
      { kind: 'text', text: 'b' },
    ])
  })
})

describe('parsePromptContent', () => {
  it('handles text, image and document blocks', () => {
    const segs = parsePromptContent(
      [
        { type: 'text', text: 'see [Image #1]' },
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } },
        {
          type: 'document',
          title: 'spec.pdf',
          source: { type: 'base64', media_type: 'application/pdf', data: 'JVBE' },
        },
        { type: 'weird' },
      ],
      newPasteCounter(),
    )
    expect(segs).toEqual([
      { kind: 'text', text: 'see [Image #1]' },
      { kind: 'image', mediaType: 'image/jpeg', base64: 'AAAA' },
      { kind: 'document', mediaType: 'application/pdf', base64: 'JVBE', name: 'spec.pdf' },
    ])
  })

  it('returns [] for unexpected content', () => {
    expect(parsePromptContent(42, newPasteCounter())).toEqual([])
  })
})

describe('commands and markers', () => {
  it('parses command tags', () => {
    expect(
      parseCommandTags(
        '<command-name>/model</command-name>\n  <command-message>model</command-message>\n  <command-args>opus</command-args>',
      ),
    ).toEqual({ name: '/model', message: 'model', args: 'opus' })
    expect(parseCommandTags('<command-name>/clear</command-name><command-args></command-args>')).toEqual({
      name: '/clear',
      message: undefined,
      args: undefined,
    })
    expect(parseCommandTags('nope')).toBeUndefined()
  })

  it('parses command output and strips ANSI codes', () => {
    expect(
      parseCommandOutput('<local-command-stdout>Set \u001b[1mOpus\u001b[22m</local-command-stdout>'),
    ).toBe('Set Opus')
    expect(parseCommandOutput('<local-command-stderr>boom</local-command-stderr>')).toBe('boom')
    expect(parseCommandOutput('plain')).toBeUndefined()
  })

  it('detects interrupts', () => {
    expect(detectInterrupt('[Request interrupted by user]')).toBe('user')
    expect(detectInterrupt([{ type: 'text', text: '[Request interrupted by user for tool use]' }])).toBe(
      'tool-use',
    )
    expect(detectInterrupt('please do not interrupt')).toBeUndefined()
  })

  it('parses task notifications', () => {
    const text =
      '<task-notification>\n<task-id>a1</task-id>\n<tool-use-id>toolu_1</tool-use-id>\n<status>completed</status>\n<summary>Agent "x" finished</summary>\n</task-notification>'
    expect(parseTaskNotification(text)).toEqual({
      taskId: 'a1',
      toolUseId: 'toolu_1',
      status: 'completed',
      summary: 'Agent "x" finished',
      outputFile: undefined,
    })
  })

  it('parses agent messages and cleans the hand-back preamble', () => {
    const m = parseAgentMessage(
      'Another Claude session sent a message:\n<agent-message from="a9">\n[Subagent hand-back] The text below is the final report.\n    Line one\n      indented\n</agent-message>',
    )
    expect(m).toEqual({ from: 'a9', body: 'Line one\n  indented' })
    expect(cleanHandback('[Subagent hand-back] short')).toBe('short')
  })

  it('builds previews without tags or pastes', () => {
    expect(
      promptPreview('Fix <b>this</b>\n<pasted_content id="1">\nlots\n</pasted_content id="1">\nplease'),
    ).toBe('Fix this [Pasted text] please')
    expect(promptPreview('x'.repeat(100), 80)).toHaveLength(81)
  })

  it('builds mentions from attachments', () => {
    expect(
      mentionFromAttachment({ type: 'directory', path: '/a/b', displayPath: 'b', content: 'ls' }, 3),
    ).toEqual({
      kind: 'directory',
      path: 'b',
      content: 'ls',
      recordLine: 3,
    })
    expect(mentionFromAttachment({ type: 'pdf_reference', filename: '/x.pdf', pageCount: 4 })).toMatchObject({
      kind: 'pdf',
      path: '/x.pdf',
      content: '4 pages',
    })
    expect(mentionFromAttachment({ type: 'date' })).toBeUndefined()
  })
})
