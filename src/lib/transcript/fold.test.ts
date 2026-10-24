import { FORK_ID, SUBAGENT_ID, SYNTHETIC_SESSION_ID, fixtures } from '../../test/fixtures'
import { METADATA_TYPES, placedLines } from '../../test/placement'
import { foldSession } from './fold'
import { parseJsonl } from './parse'
import type { AssistantItem, Block, EventItem, Session, SubagentFileInfo, ToolBlock, Turn } from './types'

const parse = (text: string) => parseJsonl(text).records

const items = <K extends Turn['items'][number]['kind']>(s: Session, kind: K) =>
  s.turns.flatMap((t) =>
    t.items.filter((i): i is Extract<Turn['items'][number], { kind: K }> => i.kind === kind),
  )

const assistants = (s: Session) => items(s, 'assistant') as AssistantItem[]
const events = (s: Session) => items(s, 'event') as EventItem[]
const allBlocks = (s: Session): Block[] => assistants(s).flatMap((a) => a.blocks)
const tool = (s: Session, id: string) =>
  allBlocks(s).find((b): b is ToolBlock => b.kind === 'tool' && b.id === id)
const turnWith = (s: Session, text: string) => s.turns.find((t) => t.prompt?.rawText.includes(text))
const tid = (n: number) => `toolu_01SYNTH000000000${String(n).padStart(2, '0')}`

const subagentFiles = (): SubagentFileInfo[] => [
  {
    agentId: SUBAGENT_ID,
    fileKey: `${SYNTHETIC_SESSION_ID}/subagents/agent-${SUBAGENT_ID}.jsonl`,
    meta: JSON.parse(fixtures.agentMeta.text) as Record<string, unknown>,
  },
  {
    agentId: FORK_ID,
    fileKey: `${SYNTHETIC_SESSION_ID}/subagents/agent-${FORK_ID}.jsonl`,
    meta: JSON.parse(fixtures.forkMeta.text) as Record<string, unknown>,
    forkParentLastUuid: '00000000-0000-4000-8000-000000000077',
  },
]

describe('foldSession on the synthetic fixture', () => {
  const records = parse(fixtures.main.text)
  const s = foldSession(records, { subagentFiles: subagentFiles() })

  it('parses every line', () => {
    expect(records).toHaveLength(121)
    expect(parseJsonl(fixtures.main.text).errors).toEqual([])
  })

  it('puts every record somewhere', () => {
    const placed = placedLines(s)
    const missing = records.filter((r) => !placed.has(r.line) && !METADATA_TYPES.has(r.type))
    expect(missing.map((r) => `${r.line}:${r.type}`)).toEqual([])
    // Metadata records are never rendered as rows (snapshots only as a prompt's checkpoint marker).
    for (const r of records) {
      if (!METADATA_TYPES.has(r.type)) continue
      expect(placed.get(r.line) ?? 'none').toBe(
        r.type === 'file-history-snapshot' && placed.has(r.line) ? 'checkpoint' : 'none',
      )
    }
    expect(s.raw).toBe(records)
  })

  it('groups assistant records by message.id ordered by apiBlockIndex', () => {
    const first = assistants(s).find((a) => a.id === 'msg_01SYNTH0000000000000001')
    expect(first?.blocks.map((b) => (b.kind === 'tool' ? `tool:${b.name}` : b.kind))).toEqual([
      'thinking',
      'text',
      'tool:Bash',
      'tool:Read',
    ])
    expect(first?.recordLines).toEqual([24, 25, 26, 27])
    expect(first?.requestId).toBeTruthy()
    // 21 API messages on the active branch; every assistant record in the file is in exactly one group.
    expect(s.summary.assistantMessageCount).toBe(21)
    const grouped = new Set(
      [...assistants(s), ...s.abandoned.flatMap((a) => a.turns ?? []).flatMap((t) => t.items)].flatMap((i) =>
        i.kind === 'assistant' ? i.recordLines : [],
      ),
    )
    for (const r of records) if (r.type === 'assistant') expect(grouped.has(r.line)).toBe(true)
  })

  it('takes usage from the stop_reason record, else the last record (non-final)', () => {
    const first = assistants(s).find((a) => a.id === 'msg_01SYNTH0000000000000001')
    expect(first?.usage).toMatchObject({
      outputTokens: 512,
      final: true,
      inputTokens: 3,
      cacheReadTokens: 18000,
      cacheWriteTokens: 1200,
    })
    expect(first?.stopReason).toBe('tool_use')
    const aborted = assistants(s).find((a) => a.id === 'msg_01SYNTH0000000000000018')
    expect(aborted?.aborted).toBe(true)
    expect(aborted?.usage.final).toBe(false)
    expect(aborted?.usage.outputTokens).toBe(8)
    expect(s.summary.tokens.final).toBe(false)
    const sum = assistants(s).reduce((n, a) => n + a.usage.outputTokens, 0)
    expect(s.summary.tokens.outputTokens).toBe(sum)
  })

  it('keeps thinking duration and empty thinking text', () => {
    const thinking = allBlocks(s).filter((b) => b.kind === 'thinking')
    expect(thinking.length).toBeGreaterThan(0)
    expect(thinking.some((b) => b.kind === 'thinking' && b.text === '' && (b.durationMs ?? 0) > 0)).toBe(true)
    expect(thinking.some((b) => b.kind === 'thinking' && b.text.length > 0)).toBe(true)
  })

  it('pairs tool results by tool_use_id (parallel calls included) and keeps toolUseResult', () => {
    for (const b of allBlocks(s)) if (b.kind === 'tool') expect(b.result, b.name).toBeDefined()
    const bash = tool(s, tid(1))
    expect(bash?.result?.recordLine).toBe(28)
    expect(bash?.result?.structured).toMatchObject({ stdout: expect.any(String) })
    expect(bash?.summary).toBeTruthy()
    expect(bash?.endedAt).toBeTruthy()
    expect(tool(s, tid(2))?.result?.recordLine).toBe(30)
    expect(tool(s, tid(3))?.result?.recordLine).toBe(34)
    expect(tool(s, tid(4))?.result?.recordLine).toBe(35)
    const edit = tool(s, tid(5))
    expect(edit?.result?.structured).toMatchObject({ structuredPatch: expect.any(Array) })
  })

  it('preserves image and document blocks as base64', () => {
    const img = tool(s, tid(7))?.result?.content[0]
    expect(img).toMatchObject({ type: 'image', mediaType: 'image/png' })
    expect(img?.type === 'image' && img.base64.startsWith('iVBOR')).toBe(true)
    const pdf = tool(s, tid(8))?.result?.content.find((c) => c.type === 'document')
    expect(pdf).toMatchObject({ type: 'document', mediaType: 'application/pdf' })
    const imagePrompt = turnWith(s, 'screenshot')
    expect(imagePrompt?.prompt?.segments.find((x) => x.kind === 'image')).toMatchObject({
      mediaType: 'image/png',
    })
  })

  it('records the line of each tool_use record', () => {
    const blocks = allBlocks(s).filter((b): b is ToolBlock => b.kind === 'tool')
    expect(blocks.length).toBeGreaterThan(0)
    for (const b of blocks) {
      const rec = records.find((r) => r.line === b.recordLine)
      const content = (rec?.message as { content?: unknown } | undefined)?.content
      expect(Array.isArray(content) && content.some((c) => (c as { id?: string }).id === b.id)).toBe(true)
      if (b.result) expect(b.recordLine).toBeLessThan(b.result.recordLine)
    }
  })

  it('marks errors, denials and persisted output', () => {
    const failing = tool(s, tid(14))
    expect(failing?.result?.isError).toBe(true)
    expect(failing?.result?.structured).toMatch(/^Error: Exit code 1/)
    expect(tool(s, tid(16))?.result?.denied).toBe('user-rejected')
    expect(tool(s, tid(17))?.result?.persistedPath).toMatch(/tool-results\/.+\.txt$/)
  })

  it('routes toolUseID attachments and the skill body to their tools', () => {
    expect(tool(s, tid(1))?.attachments.map((a) => a.type)).toEqual(['bash_output_audience_note'])
    expect(tool(s, tid(14))?.attachments.map((a) => a.type)).toEqual(['hook_system_message'])
    expect(tool(s, tid(17))?.attachments.map((a) => a.type)).toEqual(['read_truncation_notice'])
    const skill = tool(s, tid(12))
    expect(skill?.attachments[0]).toMatchObject({ type: 'meta', label: 'Skill instructions' })
    expect(skill?.attachments[0].text).toContain('Base directory for this skill')
  })

  it('numbers pasted text and counts its lines', () => {
    const t = turnWith(s, 'word-count command')
    expect(t?.kind).toBe('human')
    expect(t?.id).toBe('5e55a0de-9000-4000-8000-000000000002')
    const pasted = t?.prompt?.segments.filter((x) => x.kind === 'pasted')
    // "+M lines" is the newline count of the pasted text (verified against history.jsonl).
    expect(pasted).toEqual([
      {
        kind: 'pasted',
        id: 'a1f3',
        index: 1,
        lines: 3,
        text: expect.stringMatching(/^SPEC PLACEHOLDER LINE 1\n/),
      },
    ])
    expect(t?.prompt?.segments[0]).toMatchObject({
      kind: 'text',
      text: expect.stringContaining('@src/cli.py'),
    })
    expect(t?.prompt?.mentions).toEqual([
      { kind: 'file', path: 'src/cli.py', content: expect.stringContaining('import sys'), recordLine: 12 },
    ])
    expect(t?.checkpoint).toEqual({ fileCount: 0, recordLine: 10 })
  })

  it('folds slash commands from user records and from system/local_command', () => {
    const model = s.turns.find((t) => t.prompt?.command?.name === '/model')
    expect(model?.kind).toBe('slash-command')
    expect(model?.prompt?.command).toEqual({
      name: '/model',
      args: 'opus',
      message: 'model',
      stdout: expect.stringMatching(/^Set model to Opus 5\.5 and saved/),
    })
    expect(model?.prompt?.command?.stdout).not.toContain('\u001b')
    expect(model?.hiddenContext.map((h) => h.label)).toEqual(['Local command caveat'])
    expect(model?.recordLines).toEqual([6, 7])
    const effort = s.turns.find((t) => t.prompt?.command?.name === '/effort')
    expect(effort?.prompt?.command).toMatchObject({ args: 'high', stdout: 'Set effort level to high' })
    expect(effort?.recordLines).toEqual([8, 9])
  })

  it('shows queued messages as queued-user items', () => {
    const queued = items(s, 'queued-user')
    expect(queued).toHaveLength(1)
    expect(queued[0]).toMatchObject({ text: 'also make it handle empty input', recordLine: 57 })
    expect(turnWith(s, 'screenshot')?.items.some((i) => i.kind === 'queued-user')).toBe(true)
  })

  it('records interrupts on the turn and as events', () => {
    expect(turnWith(s, 'delete the old build')?.interrupted).toBe('tool-use')
    expect(turnWith(s, 'Explain the change')?.interrupted).toBe('user')
    expect(events(s).filter((e) => e.category === 'interrupt')).toHaveLength(2)
  })

  it('turns compaction into a compact-summary turn with a compaction item', () => {
    const t = s.turns.find((x) => x.kind === 'compact-summary')
    const c = t?.items.find((i) => i.kind === 'compaction')
    expect(c).toMatchObject({
      kind: 'compaction',
      preTokens: 151000,
      trigger: 'auto',
      recordLines: [100, 101],
    })
    expect(c?.kind === 'compaction' && c.summaryMarkdown).toMatch(/^This session is being continued/)
    expect(t?.prompt?.rawText).toMatch(/^This session is being continued/)
    expect(t?.hiddenContext.map((h) => h.label)).toEqual([
      'File referenced before compaction',
      'Re-injected skills',
    ])
  })

  it('turns system records into events and turn durations', () => {
    expect(turnWith(s, 'word-count command')?.durationMs).toBe(41250)
    const cats = new Set(events(s).map((e) => e.category))
    for (const c of [
      'turn-duration',
      'hook',
      'interrupt',
      'recap',
      'informational',
      'diagnostics',
      'task-status',
    ] as const)
      expect(cats.has(c), c).toBe(true)
    expect(events(s).find((e) => e.category === 'recap')?.detail).toContain('word-count')
    // Session-start hooks live in a leading meta turn.
    expect(s.turns[0]).toMatchObject({ kind: 'meta' })
    expect(s.turns[0].items.map((i) => (i.kind === 'event' ? i.label : i.kind))).toEqual([
      'Hook: SessionStart:startup',
      'Hook context: SessionStart',
    ])
  })

  it('hides context attachments with the text the model saw, redacting the email', () => {
    const t = turnWith(s, 'word-count command')
    const labels = t?.hiddenContext.map((h) => h.label) ?? []
    expect(labels).toEqual(
      expect.arrayContaining([
        'Skill listing',
        'Environment',
        'System prompt snapshot',
        'Token budget reminder',
      ]),
    )
    const ctx = t?.hiddenContext.find((h) => h.label.startsWith('Session context'))
    expect(ctx?.text).not.toContain('@example.com')
    const skills = t?.hiddenContext.find((h) => h.label === 'Skill listing')
    expect(skills?.text).toContain('<system-reminder>')
    const ids = s.turns.flatMap((x) => x.hiddenContext.map((h) => h.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps the rewound branch as an abandoned stub at the fork point', () => {
    expect(s.abandoned).toHaveLength(1)
    const a = s.abandoned[0]
    expect(a.records.map((r) => r.line)).toEqual([91, 92])
    expect(a.forkAfterUuid).toBe('00000000-0000-4000-8000-000000000086')
    expect(a.replacedByTurnId).toBe('5e55a0de-9000-4000-8000-000000000008')
    expect(a.firstPromptPreview).toBe('Summarize the session.')
    expect(a.turns?.[0].kind).toBe('human')
    const errItem = a.turns?.[0].items[0]
    expect(errItem?.kind === 'assistant' && errItem.error).toEqual({
      status: 529,
      text: expect.stringContaining('529 Overloaded'),
    })
    // The anchor is an existing row of the active branch.
    const rowIds = new Set(s.turns.flatMap((t) => [t.id, ...t.items.map((i) => i.id)]))
    expect(rowIds.has(a.anchorRowId)).toBe(true)
    expect(s.summary.abandonedRecordCount).toBe(2)
  })

  it('keeps the fallback block', () => {
    expect(allBlocks(s).find((b) => b.kind === 'fallback')).toMatchObject({
      kind: 'fallback',
      from: expect.any(String),
      to: expect.any(String),
    })
  })

  it('links subagents through meta.json, task notifications and agent messages', () => {
    const agent = tool(s, tid(15))
    expect(agent?.subagent).toMatchObject({
      agentId: SUBAGENT_ID,
      toolUseId: tid(15),
      description: 'Review word-count change',
      agentType: 'general-purpose',
      model: 'claude-opus-5-5',
      status: 'completed',
      handback: 'No bugs found. (placeholder report)',
      fileKey: `${SYNTHETIC_SESSION_ID}/subagents/agent-${SUBAGENT_ID}.jsonl`,
    })
    const note = s.turns.find((t) => t.kind === 'task-notification')
    expect(note?.prompt?.notification).toMatchObject({
      taskId: SUBAGENT_ID,
      toolUseId: tid(15),
      status: 'completed',
    })
    expect(note?.subagent).toBe(agent?.subagent)
    const msg = s.turns.find((t) => t.kind === 'agent-message')
    expect(msg?.prompt?.agentMessage).toEqual({
      from: SUBAGENT_ID,
      body: 'No bugs found. (placeholder report)',
      handback: true,
    })
    expect(msg?.subagent).toBe(agent?.subagent)
    const btw = s.turns.find((t) => t.prompt?.command?.name === '/btw')
    expect(btw?.subagent).toMatchObject({
      agentId: FORK_ID,
      fileKey: expect.stringContaining(FORK_ID),
      agentType: 'fork',
    })
    expect(s.subagents.map((r) => r.agentId)).toEqual([SUBAGENT_ID, FORK_ID])
    expect(s.summary.subagentCount).toBe(2)
    expect(s.summary.subagentFilesPresent).toBe(2)
  })

  it('works without subagent files', () => {
    const bare = foldSession(parse(fixtures.main.text))
    expect(bare.subagents).toHaveLength(1)
    expect(bare.subagents[0].fileKey).toBeUndefined()
    expect(bare.summary.subagentFilesPresent).toBe(0)
  })

  it('computes the summary', () => {
    expect(s.summary).toMatchObject({
      sessionId: SYNTHETIC_SESSION_ID,
      title: 'Add a word-count CLI to demo project',
      titleSource: 'ai-title',
      cwd: '/home/dev/demo-project',
      projectName: 'demo-project',
      gitBranch: 'main',
      startedAt: '2026-10-20T09:00:00.400Z',
      endedAt: '2026-10-20T09:01:06.200Z',
      durationMs: 65800,
      turnCount: 7,
      toolCallCount: 17,
      models: ['claude-opus-5-5'],
      versions: ['2.1.295'],
      entrypoint: 'cli',
      permissionMode: 'default',
      costUsd: 0.4213,
      costSource: 'cost-state',
      continuedInSessionId: '5e55a0de-0000-4000-8000-000000000002',
      lastPrompt: 'Run the tests one more time.',
    })
    expect(s.summary.parent).toBeUndefined()
  })

  it('uses unique ids for turns, items and blocks', () => {
    const ids = [
      ...s.turns.map((t) => t.id),
      ...s.turns.flatMap((t) => t.items.map((i) => i.id)),
      ...allBlocks(s).map((b) => b.id),
    ]
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('ignores records copied with an already-seen uuid (continued-in copies)', () => {
    const lines = fixtures.main.text.split('\n')
    // Re-append a copy of the interrupt turn (same uuids): it must not render twice.
    const copied = [...lines, ...lines.slice(84, 88).map((l) => l.replace('Now delete', 'COPY delete'))].join(
      '\n',
    )
    const twice = foldSession(parse(copied))
    expect(twice.turns.map((t) => t.id)).toEqual(
      foldSession(parse(fixtures.main.text)).turns.map((t) => t.id),
    )
    expect(JSON.stringify(twice.turns)).not.toContain('COPY delete')
  })

  it('estimates cost when there is no cost-state', () => {
    const noCost = fixtures.main.text
      .split('\n')
      .filter((l) => !l.includes('"cost-state"'))
      .join('\n')
    const est = foldSession(parse(noCost)).summary
    expect(est.costSource).toBe('estimate')
    expect(est.costUsd).toBeGreaterThan(0)
  })
})

describe('foldSession on subagent transcripts', () => {
  it('folds an Agent subagent and sets summary.parent', () => {
    const s = foldSession(parse(fixtures.agent.text), {
      fileKey: `${SYNTHETIC_SESSION_ID}/subagents/agent-${SUBAGENT_ID}.jsonl`,
      agentId: SUBAGENT_ID,
      agentMeta: JSON.parse(fixtures.agentMeta.text) as Record<string, unknown>,
    })
    expect(s.summary.parent).toEqual({
      sessionId: SYNTHETIC_SESSION_ID,
      agentId: SUBAGENT_ID,
      toolUseId: tid(15),
    })
    expect(s.summary.sessionId).toBe(`${SYNTHETIC_SESSION_ID}/subagents/agent-${SUBAGENT_ID}.jsonl`)
    expect(s.turns[0]).toMatchObject({ kind: 'human' })
    expect(s.turns[0].prompt?.rawText).toContain('Review src/cli.py')
    expect(s.turns[0].hiddenContext.map((h) => h.label)).toEqual(['System reminder', 'Date'])
    expect(events(s).map((e) => e.label)).toEqual(['Loaded 1 instruction file'])
    const handback = allBlocks(s).find((b) => b.kind === 'tool' && b.name === 'SubagentHandback')
    expect(handback?.kind === 'tool' && handback.result?.structured).toMatchObject({ success: true })
    expect(assistants(s).every((a) => a.agent === 'general-purpose')).toBe(true)
  })

  it('folds a /btw fork transcript', () => {
    const s = foldSession(parse(fixtures.fork.text), { agentId: FORK_ID })
    expect(s.summary.parent).toMatchObject({ sessionId: SYNTHETIC_SESSION_ID, agentId: FORK_ID })
    expect(s.turns).toHaveLength(1)
    expect(s.turns[0].prompt?.rawText).toBe('what does wc stand for?')
    expect(s.turns[0].hiddenContext.map((h) => h.label)).toEqual(['Fork boilerplate'])
    expect(assistants(s).map((a) => a.model)).toEqual(['<synthetic>', 'claude-opus-5-5'])
    expect(s.summary.models).toEqual(['claude-opus-5-5'])
  })
})
