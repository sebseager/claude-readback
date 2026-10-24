// Per-record handlers for user / attachment / system records (§12.1 step 4).
import {
  MENTION_ATTACHMENT_TYPES,
  contentText,
  detectInterrupt,
  isTaskNotification,
  mentionFromAttachment,
  parseAgentMessage,
  parseBashInput,
  parseBashOutput,
  parseCommandOutput,
  parseCommandTags,
  parsePromptContent,
  parsePromptText,
  parseTaskNotification,
} from '../prompt'
import type {
  CompactionItem,
  EventItem,
  EventLevel,
  PromptSegment,
  RawRecord,
  Turn,
  UserPrompt,
} from '../types'
import { arr, durationMs, get, isObj, num, obj, str } from '../util'
import { type TurnBuilder, jsonDump, renderedText } from './builder'

// ------------------------------------------------------------------------------------------- user

export function handleUser(b: TurnBuilder, r: RawRecord) {
  const content = get(r, 'message', 'content')
  const blocks = arr(content)
  if (blocks && blocks.some((x) => isObj(x) && x.type === 'tool_result')) {
    b.handleToolResults(r, blocks)
    if (r.interruptedByShutdown === true) markInterrupted(b, r, 'shutdown')
    return
  }
  if (r.isCompactSummary === true) return handleCompactSummary(b, r, contentText(content))

  const interrupt = detectInterrupt(content)
  if (interrupt) return markInterrupted(b, r, r.interruptedByShutdown === true ? 'shutdown' : interrupt)

  const text = contentText(content)
  const head = text.trimStart()
  const originKind = str(get(r, 'origin', 'kind'))

  if (head.startsWith('<command-name>')) return openSlashCommand(b, r, text)
  if (head.startsWith('<local-command-stdout>') || head.startsWith('<local-command-stderr>'))
    return attachCommandOutput(b, r, parseCommandOutput(text) ?? '')
  if (head.startsWith('<local-command-caveat>'))
    return b.addHidden(r, 'Local command caveat', text, { pending: true })
  if (head.startsWith('<bash-input>')) {
    const turn = b.openTurn('slash-command', r)
    turn.prompt = basePrompt(r, text, { name: '!', args: parseBashInput(text)?.trim() })
    return
  }
  if (head.startsWith('<bash-stdout>') || head.startsWith('<bash-stderr>'))
    return attachCommandOutput(b, r, parseBashOutput(text) ?? '')
  if (isTaskNotification(head) || originKind === 'task-notification') return openTaskNotification(b, r, text)
  if (
    originKind === 'peer' ||
    head.startsWith('<agent-message') ||
    head.startsWith('Another Claude session sent a message')
  )
    return openAgentMessage(b, r, text)
  if (head.startsWith('<fork-boilerplate>')) return b.addHidden(r, 'Fork boilerplate', text)

  if (r.isMeta === true) {
    const toolUseId = str(r.sourceToolUseID)
    const tool = toolUseId ? b.tools.get(toolUseId) : undefined
    if (tool) {
      const label = head.startsWith('Base directory for this skill')
        ? 'Skill instructions'
        : 'Context for this tool call'
      b.addToolAttachment(r, tool, { type: 'meta', label, text })
      return
    }
    // A meta string with its own promptId (coordinator / system notifications) gets a reply: its own turn.
    // Image-scaling notes also carry a fresh promptId but are plumbing.
    const promptId = str(r.promptId)
    const startsNewTurn =
      b.cur !== undefined &&
      promptId !== undefined &&
      promptId !== b.curPromptId &&
      !head.startsWith('[Image:')
    if (startsNewTurn && typeof content === 'string') {
      const turn = b.openTurn('meta', r)
      turn.prompt = basePrompt(r, text)
      turn.prompt.segments = parsePromptContent(content, b.pastes)
      return
    }
    return b.addHidden(r, metaLabel(head), text)
  }

  // A human prompt.
  const turn = b.openTurn('human', r)
  turn.prompt = basePrompt(r, typeof content === 'string' ? content : text)
  turn.prompt.segments = parsePromptContent(content, b.pastes)
  if (str(r.promptSource) === 'queued') turn.prompt.queued = true
}

function basePrompt(r: RawRecord, rawText: string, command?: UserPrompt['command']): UserPrompt {
  const p: UserPrompt = { segments: [], mentions: [], rawText, recordUuid: str(r.uuid) ?? '' }
  if (command) p.command = command
  return p
}

function metaLabel(head: string): string {
  if (head.startsWith('<system-reminder>')) return 'System reminder'
  if (head.startsWith('[Image:')) return 'Image scaling note'
  if (head.startsWith('[SYSTEM NOTIFICATION')) return 'System notification'
  return 'Meta message'
}

function markInterrupted(b: TurnBuilder, r: RawRecord, kind: 'user' | 'tool-use' | 'shutdown') {
  const turn = b.ensureTurn(r)
  turn.interrupted = kind
  const label =
    kind === 'shutdown'
      ? 'Interrupted · Claude Code exited'
      : kind === 'tool-use'
        ? 'Interrupted by user · tool use'
        : 'Interrupted by user'
  b.addEvent(r, { category: 'interrupt', label, level: 'warning', detail: str(r.interruptedMessageId) })
}

function openSlashCommand(b: TurnBuilder, r: RawRecord, text: string, commandRun?: unknown) {
  const parsed = parseCommandTags(text)
  const name =
    parsed?.name || (str(get(commandRun, 'command')) ? `/${str(get(commandRun, 'command'))}` : '/?')
  const turn = b.openTurn('slash-command', r)
  // Text pasted after the command lands inside <command-args>; pull it out like a prompt's pastes.
  let args = parsed?.args
  let segments: PromptSegment[] = []
  if (args?.includes('<pasted_content')) {
    segments = parsePromptText(args, b.pastes)
    args =
      segments
        .flatMap((s) => (s.kind === 'text' ? [s.text.trim()] : []))
        .join(' ')
        .trim() || undefined
  }
  turn.prompt = basePrompt(r, text, { name, args, message: parsed?.message })
  turn.prompt.segments = segments
}

function attachCommandOutput(b: TurnBuilder, r: RawRecord, stdout: string) {
  const turn = b.cur
  const cmd = turn?.kind === 'slash-command' ? turn.prompt?.command : undefined
  if (turn && cmd && cmd.stdout === undefined) {
    cmd.stdout = stdout
    turn.recordLines?.push(r.line)
    b.mapRow(r, turn.id)
    return
  }
  b.addEvent(r, { category: 'local-command', label: 'Command output', detail: stdout, level: 'info' })
}

function openTaskNotification(b: TurnBuilder, r: RawRecord, text: string) {
  const turn = b.openTurn('task-notification', r)
  turn.prompt = basePrompt(r, text)
  turn.prompt.segments = [{ kind: 'text', text }]
  const n = parseTaskNotification(text)
  if (n) turn.prompt.notification = n
}

function openAgentMessage(b: TurnBuilder, r: RawRecord, text: string) {
  const turn = b.openTurn('agent-message', r)
  turn.prompt = basePrompt(r, text)
  const parsed = parseAgentMessage(text)
  const origin = obj(r.origin)
  const from = parsed?.from || str(origin?.from) || ''
  const body = parsed?.body ?? str(origin?.body) ?? text
  turn.prompt.segments = [{ kind: 'text', text: body }]
  turn.prompt.agentMessage = { from, body, handback: origin?.handback === true }
}

function handleCompactSummary(b: TurnBuilder, r: RawRecord, text: string) {
  let turn: Turn | undefined = b.cur
  const compaction =
    turn?.kind === 'compact-summary' && !turn.prompt ? turn.items.find(isCompaction) : undefined
  if (!turn || turn.kind !== 'compact-summary' || turn.prompt) {
    turn = b.openTurn('compact-summary', r)
  } else {
    turn.recordLines?.push(r.line)
    b.mapRow(r, turn.id)
  }
  turn.prompt = basePrompt(r, text)
  turn.prompt.segments = [{ kind: 'text', text }]
  if (compaction) {
    compaction.summaryMarkdown = text
    compaction.recordLines.push(r.line)
  }
}

const isCompaction = (i: Turn['items'][number]): i is CompactionItem => i.kind === 'compaction'

// ------------------------------------------------------------------------------------- attachment

const EVENT_ATTACHMENTS = new Set([
  'diagnostics',
  'edited_text_file',
  'task_status',
  'instructions',
  'date_change',
])

const HIDDEN_LABELS: Record<string, string> = {
  total_tokens_reminder: 'Token budget reminder',
  deferred_tools_record: 'Deferred tools record',
  deferred_tools_delta: 'Available tools changed',
  bash_output_audience_note: 'Bash output note',
  batching_reminder_sent: 'Batching reminder',
  prompt_snapshot: 'System prompt snapshot',
  environment: 'Environment',
  skill_listing: 'Skill listing',
  date: 'Date',
  model: 'Model identity',
  mcp_instructions_delta: 'MCP instructions changed',
  session_context: 'Session context (redacted)',
  credential_org: 'Credential organization',
  remote_session_change: 'Remote session info',
  auto_mode: 'Auto mode',
  agent_listing_delta: 'Agent types changed',
  silent_turn_reminder: 'Silent turn reminder',
  command_permissions: 'Command permissions',
  task_reminder: 'Task reminder',
  thinking_drop: 'Thinking dropped',
  compact_file_reference: 'File referenced before compaction',
  invoked_skills: 'Re-injected skills',
  structured_output: 'Structured output',
  workflow_keyword_request: 'Workflow keyword',
  queued_command: 'Queued command',
}

const humanize = (type: string) =>
  HIDDEN_LABELS[type] ?? type.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())

/** The text to show for an attachment: what the model saw, else a JSON dump. */
function attachmentText(r: RawRecord, att: Record<string, unknown>): string {
  const text = renderedText(r) || jsonDump(att)
  if (str(att.type) === 'session_context') return redactSessionContext(text, att)
  return text
}

function redactSessionContext(text: string, att: Record<string, unknown>): string {
  let out = text
  const ctx = obj(att.context)
  if (ctx) {
    for (const v of Object.values(ctx)) {
      if (typeof v === 'string' && v.length > 2) out = out.split(v).join('[redacted]')
    }
  }
  return out.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[redacted]')
}

export function handleAttachment(b: TurnBuilder, r: RawRecord) {
  const att = obj(r.attachment) ?? {}
  const type = str(att.type) ?? 'unknown'
  const toolUseId = str(att.toolUseID)
  const tool = toolUseId ? b.tools.get(toolUseId) : undefined
  if (tool) {
    const text = type === 'structured_output' ? jsonDump(att.data) : attachmentText(r, att)
    b.addToolAttachment(r, tool, { type, label: attachmentLabel(type, att), text })
    return
  }

  if (type === 'queued_command') return handleQueued(b, r, att)

  if (MENTION_ATTACHMENT_TYPES.has(type)) {
    const turn = b.cur
    const mention = mentionFromAttachment(att, r.line)
    if (turn?.prompt && turn.kind === 'human' && mention) {
      turn.prompt.mentions.push(mention)
      b.mapRow(r, turn.id)
      return
    }
  }

  if (type.startsWith('hook_') || EVENT_ATTACHMENTS.has(type)) {
    const ev = attachmentEvent(type, att)
    b.addEvent(r, ev)
    return
  }

  b.addHidden(r, humanize(type), attachmentText(r, att))
}

function handleQueued(b: TurnBuilder, r: RawRecord, att: Record<string, unknown>) {
  const prompt = str(att.prompt) ?? contentText(att.prompt)
  const mode = str(att.commandMode)
  const originKind = str(get(att, 'origin', 'kind'))
  if (mode === 'task-notification' || isTaskNotification(prompt)) {
    const n = parseTaskNotification(prompt)
    b.addEvent(r, {
      category: 'task-status',
      label: n?.summary ?? 'Task notification',
      detail: prompt,
      level: 'info',
      at: str(att.timestamp) ?? str(r.timestamp),
    })
    return
  }
  const human =
    originKind === 'human' ||
    att.humanTurn === true ||
    (originKind === undefined && mode !== undefined && mode === 'prompt' && att.isMeta !== true)
  if (human) {
    b.addItem(r, {
      kind: 'queued-user',
      id: b.uniqueId(b.baseId(r, 'q-')),
      text: prompt,
      segments: parsePromptContent(prompt, b.pastes),
      at: str(att.timestamp) ?? str(r.timestamp) ?? '',
      recordLine: r.line,
    })
    return
  }
  b.addHidden(r, humanize('queued_command'), attachmentText(r, att))
}

function attachmentLabel(type: string, att: Record<string, unknown>): string {
  switch (type) {
    case 'read_truncation_notice':
      return str(att.banner) ?? 'Output truncated'
    case 'bash_output_audience_note':
      return 'Output shown only to Claude'
    case 'structured_output':
      return 'Structured output'
    case 'diagnostics':
      return 'Diagnostics'
    default:
      if (type.startsWith('hook_'))
        return `Hook ${str(att.hookEvent) ?? ''}: ${str(att.hookName) ?? type}`.trim()
      return humanize(type)
  }
}

function attachmentEvent(
  type: string,
  att: Record<string, unknown>,
): Omit<EventItem, 'kind' | 'id' | 'recordLines'> {
  const join = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').join('\n') : str(v))
  switch (type) {
    case 'diagnostics': {
      const files = arr(att.files) ?? []
      let n = 0
      const lines: string[] = []
      for (const f of files) {
        const diags = arr(get(f, 'diagnostics')) ?? []
        n += diags.length
        for (const d of diags)
          lines.push(
            `${str(get(f, 'uri')) ?? ''}:${(num(get(d, 'range', 'start', 'line')) ?? 0) + 1} ${str(get(d, 'message')) ?? ''}`,
          )
      }
      return {
        category: 'diagnostics',
        label: `${n} diagnostic${n === 1 ? '' : 's'} in ${files.length} file${files.length === 1 ? '' : 's'}`,
        detail: lines.join('\n'),
        level: 'warning',
      }
    }
    case 'edited_text_file':
      return {
        category: 'other',
        label: `File changed outside Claude: ${str(att.filename) ?? ''}`,
        detail: str(att.snippet),
        level: 'info',
      }
    case 'task_status':
      return {
        category: 'task-status',
        label: `Task ${str(att.status) ?? 'update'}: ${str(att.description) ?? str(att.taskId) ?? ''}`.trim(),
        detail: str(att.deltaSummary),
        level: 'info',
      }
    case 'instructions': {
      const files = arr(att.files) ?? []
      return {
        category: 'other',
        label: `Loaded ${files.length} instruction file${files.length === 1 ? '' : 's'}`,
        detail: files.map((f) => str(get(f, 'path')) ?? '').join('\n'),
        level: 'info',
      }
    }
    case 'date_change':
      return { category: 'date-change', label: `Date changed to ${str(att.newDate) ?? '?'}`, level: 'info' }
    default: {
      const level: EventLevel = type.includes('blocking_error')
        ? 'error'
        : type.includes('error') || type.includes('cancel')
          ? 'warning'
          : type === 'hook_system_message'
            ? 'notice'
            : 'info'
      const name = str(att.hookName) ?? str(att.hookEvent) ?? 'hook'
      const prefix =
        type === 'hook_additional_context'
          ? 'Hook context'
          : type === 'hook_system_message'
            ? 'Hook message'
            : 'Hook'
      const detail = join(att.content) || str(att.stdout) || str(att.stderr) || undefined
      return { category: 'hook', label: `${prefix}: ${name}`, detail, level }
    }
  }
}

// ----------------------------------------------------------------------------------------- system

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

const levelOf = (v: unknown): EventLevel =>
  v === 'error' ? 'error' : v === 'warning' ? 'warning' : v === 'notice' ? 'notice' : 'info'

export function handleSystem(b: TurnBuilder, r: RawRecord) {
  const subtype = str(r.subtype) ?? 'unknown'
  const content = str(r.content) ?? ''
  switch (subtype) {
    case 'turn_duration': {
      const ms = durationMs(r.durationMs)
      const turn = b.ensureTurn(r)
      if (ms !== undefined) turn.durationMs = ms
      b.addEvent(r, {
        category: 'turn-duration',
        label: ms !== undefined ? `Turn took ${formatDuration(ms)}` : 'Turn ended',
        level: 'info',
      })
      return
    }
    case 'stop_hook_summary': {
      const errors = arr(r.hookErrors) ?? []
      if (errors.length > 0 || r.preventedContinuation === true) {
        b.addEvent(r, {
          category: 'hook',
          label:
            r.preventedContinuation === true
              ? 'Stop hook prevented continuation'
              : `Stop hook error${errors.length === 1 ? '' : 's'}`,
          detail:
            errors.map((e) => (typeof e === 'string' ? e : JSON.stringify(e))).join('\n') ||
            str(r.stopReason),
          level: errors.length > 0 ? 'error' : 'warning',
        })
      } else {
        const n = num(r.hookCount) ?? 0
        b.addHidden(r, `Stop hooks ran (${n})`, jsonDump(r.hookInfos ?? r))
      }
      return
    }
    case 'away_summary':
      b.addEvent(r, { category: 'recap', label: 'Recap', detail: content, level: 'info' })
      return
    case 'informational':
      b.addEvent(r, {
        category: 'informational',
        label: content || 'Notice',
        level: levelOf(r.level ?? 'notice'),
      })
      return
    case 'local_command': {
      const head = content.trimStart()
      if (head.startsWith('<command-name>')) return openSlashCommand(b, r, content, r.commandRun)
      if (head.startsWith('<local-command-stdout>') || head.startsWith('<local-command-stderr>'))
        return attachCommandOutput(b, r, parseCommandOutput(content) ?? '')
      b.addEvent(r, { category: 'local-command', label: 'Local command', detail: content, level: 'info' })
      return
    }
    case 'compact_boundary': {
      const meta = obj(r.compactMetadata)
      const turn = b.openTurn('compact-summary', r, b.baseId(r))
      const item: CompactionItem = {
        kind: 'compaction',
        id: b.uniqueId(b.baseId(r, 'compact-')),
        at: str(r.timestamp) ?? '',
        preTokens: num(meta?.preTokens),
        trigger: str(meta?.trigger),
        recordLines: [r.line],
      }
      turn.items.push(item)
      return
    }
    case 'api_error': {
      const status = num(r.status) ?? num(get(r, 'error', 'status'))
      const retry = num(r.retryInMs)
      b.addEvent(r, {
        category: 'api-error',
        label: `API error${status ? ` ${status}` : ''}${retry !== undefined ? ` · retrying in ${formatDuration(retry)}` : ''}`,
        detail: content || jsonDump(r.error),
        level: 'error',
      })
      return
    }
    default:
      b.addEvent(r, {
        category: 'other',
        label: content ? `${subtype}: ${content.slice(0, 120)}` : subtype,
        detail: content || undefined,
        level: levelOf(r.level),
      })
  }
}
