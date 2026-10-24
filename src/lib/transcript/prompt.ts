// User prompt parsing: pasted blocks, system reminders, slash-command tags, interrupts,
// task notifications and agent messages. All scanning is indexOf-based (linear, no backtracking).
import type { Mention, PromptSegment } from './types'
import { arr, get, isObj, str, stripAnsi, tagContent } from './util'

/** Per-session counter so pasted blocks are numbered #1, #2… across prompts. */
export interface PasteCounter {
  n: number
}

export const newPasteCounter = (): PasteCounter => ({ n: 0 })

const PASTE_OPEN = '<pasted_content'
const REMINDER_OPEN = '<system-reminder>'
const REMINDER_CLOSE = '</system-reminder>'

const pushText = (out: PromptSegment[], text: string) => {
  if (text.trim().length === 0) return
  const last = out[out.length - 1]
  if (last && last.kind === 'text') last.text += text
  else out.push({ kind: 'text', text })
}

/** Strip exactly one leading and one trailing newline (the wrapper Claude Code adds around a paste). */
const unwrapPaste = (s: string): string => {
  let a = 0
  let b = s.length
  if (s.charCodeAt(0) === 10) a = 1
  if (b > a && s.charCodeAt(b - 1) === 10) b -= 1
  return s.slice(a, b)
}

const countNewlines = (s: string): number => {
  let n = 0
  for (let i = s.indexOf('\n'); i >= 0; i = s.indexOf('\n', i + 1)) n++
  return n
}

/**
 * Split prompt text into text / pasted / system-reminder segments.
 * `<pasted_content id="x">…</pasted_content id="x">` (closing tag carries the id; a plain
 * `</pasted_content>` is tolerated). `lines` is the newline count of the pasted text, which is what
 * the CLI shows as "+M lines".
 */
export function parsePromptText(text: string, counter: PasteCounter): PromptSegment[] {
  const out: PromptSegment[] = []
  let pos = 0
  while (pos < text.length) {
    const p = text.indexOf(PASTE_OPEN, pos)
    const r = text.indexOf(REMINDER_OPEN, pos)
    if (p < 0 && r < 0) break
    if (p >= 0 && (r < 0 || p < r)) {
      const tagEnd = text.indexOf('>', p)
      if (tagEnd < 0) break
      const openTag = text.slice(p, tagEnd + 1)
      const idMatch = /id="([^"]*)"/.exec(openTag)
      const id = idMatch ? idMatch[1] : ''
      const exactClose = `</pasted_content id="${id}">`
      let closeAt = id ? text.indexOf(exactClose, tagEnd + 1) : -1
      let closeLen = exactClose.length
      if (closeAt < 0) {
        closeAt = text.indexOf('</pasted_content>', tagEnd + 1)
        closeLen = '</pasted_content>'.length
      }
      if (closeAt < 0) {
        // Unterminated: keep the rest as plain text.
        break
      }
      pushText(out, text.slice(pos, p))
      const body = unwrapPaste(text.slice(tagEnd + 1, closeAt))
      out.push({ kind: 'pasted', id, index: ++counter.n, lines: countNewlines(body), text: body })
      pos = closeAt + closeLen
    } else {
      const end = text.indexOf(REMINDER_CLOSE, r)
      if (end < 0) break
      pushText(out, text.slice(pos, r))
      out.push({ kind: 'system-reminder', text: text.slice(r + REMINDER_OPEN.length, end).trim() })
      pos = end + REMINDER_CLOSE.length
    }
  }
  if (pos < text.length) pushText(out, text.slice(pos))
  return out
}

/** Parse a `message.content` (string or block array) into prompt segments. */
export function parsePromptContent(content: unknown, counter: PasteCounter): PromptSegment[] {
  if (typeof content === 'string') return parsePromptText(content, counter)
  const blocks = arr(content)
  if (!blocks) return []
  const out: PromptSegment[] = []
  for (const b of blocks) {
    if (!isObj(b)) continue
    const type = str(b.type)
    if (type === 'text') {
      for (const seg of parsePromptText(str(b.text) ?? '', counter)) {
        if (seg.kind === 'text') pushText(out, seg.text)
        else out.push(seg)
      }
    } else if (type === 'image') {
      out.push({
        kind: 'image',
        mediaType: str(get(b, 'source', 'media_type')) ?? 'image/png',
        base64: str(get(b, 'source', 'data')) ?? '',
      })
    } else if (type === 'document') {
      out.push({
        kind: 'document',
        mediaType: str(get(b, 'source', 'media_type')) ?? 'application/octet-stream',
        base64: str(get(b, 'source', 'data')),
        name: str(b.title) ?? str(get(b, 'source', 'name')),
      })
    }
  }
  return out
}

/** Plain text of a content value (string, or joined text blocks). */
export function contentText(content: unknown): string {
  if (typeof content === 'string') return content
  const blocks = arr(content)
  if (!blocks) return ''
  let s = ''
  for (const b of blocks) {
    if (isObj(b) && b.type === 'text' && typeof b.text === 'string') s += (s ? '\n' : '') + b.text
  }
  return s
}

// ---------------------------------------------------------------------------------------- commands

export interface ParsedCommand {
  name: string
  message?: string
  args?: string
}

/** `<command-name>/model</command-name><command-message>…<command-args>…` → parts. */
export function parseCommandTags(text: string): ParsedCommand | undefined {
  const name = tagContent(text, 'command-name')
  if (name === undefined) return undefined
  const message = tagContent(text, 'command-message')
  const args = tagContent(text, 'command-args')
  return {
    name: name.trim(),
    message: message?.trim() || undefined,
    args: args?.trim() || undefined,
  }
}

/** `<local-command-stdout>` (and `-stderr`) body with ANSI codes removed. */
export function parseCommandOutput(text: string): string | undefined {
  const out = tagContent(text, 'local-command-stdout')
  const err = tagContent(text, 'local-command-stderr')
  if (out === undefined && err === undefined) return undefined
  return stripAnsi([out, err].filter((x) => x !== undefined && x !== '').join('\n'))
}

/** `!` bash mode (unverified format): `<bash-input>cmd</bash-input>`. */
export function parseBashInput(text: string): string | undefined {
  return tagContent(text, 'bash-input')
}

export function parseBashOutput(text: string): string | undefined {
  const out = tagContent(text, 'bash-stdout')
  const err = tagContent(text, 'bash-stderr')
  if (out === undefined && err === undefined) return undefined
  return stripAnsi([out, err].filter((x) => x !== undefined && x !== '').join('\n'))
}

// -------------------------------------------------------------------------------------- interrupts

export type InterruptKind = 'user' | 'tool-use'

const INTERRUPT_PREFIX = '[Request interrupted by user'

/** Detect `[Request interrupted by user]` / `[Request interrupted by user for tool use]`. */
export function detectInterrupt(content: unknown): InterruptKind | undefined {
  const check = (t: string): InterruptKind | undefined => {
    const s = t.trimStart()
    if (!s.startsWith(INTERRUPT_PREFIX)) return undefined
    return s.startsWith(`${INTERRUPT_PREFIX} for tool use`) ? 'tool-use' : 'user'
  }
  if (typeof content === 'string') return check(content)
  const blocks = arr(content)
  if (!blocks) return undefined
  for (const b of blocks) {
    if (isObj(b) && b.type === 'text' && typeof b.text === 'string') {
      const k = check(b.text)
      if (k) return k
    }
  }
  return undefined
}

// ------------------------------------------------------------------ notifications / agent messages

export interface TaskNotification {
  taskId?: string
  toolUseId?: string
  status?: string
  summary?: string
  outputFile?: string
}

export const isTaskNotification = (text: string): boolean =>
  text.trimStart().startsWith('<task-notification>')

export function parseTaskNotification(text: string): TaskNotification | undefined {
  const body = tagContent(text, 'task-notification')
  if (body === undefined) return undefined
  const t = (tag: string) => tagContent(body, tag)?.trim() || undefined
  return {
    taskId: t('task-id'),
    toolUseId: t('tool-use-id'),
    status: t('status'),
    summary: t('summary'),
    outputFile: t('output-file'),
  }
}

export interface AgentMessage {
  from: string
  body: string
}

/** `…<agent-message from="agentId">body</agent-message>`. */
export function parseAgentMessage(text: string): AgentMessage | undefined {
  const start = text.indexOf('<agent-message')
  if (start < 0) return undefined
  const tagEnd = text.indexOf('>', start)
  if (tagEnd < 0) return undefined
  const fromMatch = /from="([^"]*)"/.exec(text.slice(start, tagEnd + 1))
  const close = text.indexOf('</agent-message>', tagEnd)
  const raw = text.slice(tagEnd + 1, close < 0 ? text.length : close)
  return { from: fromMatch ? fromMatch[1] : '', body: cleanHandback(raw) }
}

/** Drop the "[Subagent hand-back] The text below is…" preamble line and dedent. */
export function cleanHandback(raw: string): string {
  let lines = raw.replace(/^\n+|\n+$/g, '').split('\n')
  if (lines.length > 1 && lines[0].trim().startsWith('[Subagent hand-back]')) lines = lines.slice(1)
  else if (lines.length === 1) lines[0] = lines[0].replace(/^\s*\[Subagent hand-back\]\s*/, '')
  const indents = lines.filter((l) => l.trim()).map((l) => /^[ \t]*/.exec(l)?.[0].length ?? 0)
  const min = indents.length ? Math.min(...indents) : 0
  return lines
    .map((l) => l.slice(min))
    .join('\n')
    .trim()
}

// ------------------------------------------------------------------------------------------ title

/** Plain one-line text for titles/previews: drops pasted blocks, reminders and tags. */
export function promptPreview(text: string, max = 80): string {
  const segs = parsePromptText(text, newPasteCounter())
  const parts: string[] = []
  for (const s of segs) {
    if (s.kind === 'text') parts.push(s.text)
    else if (s.kind === 'pasted') parts.push('[Pasted text]')
  }
  const plain = parts
    .join(' ')
    .replace(/<[^>\n]{1,200}>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return plain.length > max ? `${plain.slice(0, max).trimEnd()}…` : plain
}

// --------------------------------------------------------------------------------------- mentions

/** `file` / `directory` / `pdf_reference` attachment → @-mention pill. */
export function mentionFromAttachment(
  att: Record<string, unknown>,
  recordLine?: number,
): Mention | undefined {
  const type = str(att.type)
  const path = str(att.displayPath) ?? str(att.filename) ?? str(att.path) ?? ''
  if (type === 'file') {
    const content = str(get(att, 'content', 'file', 'content')) ?? str(att.content)
    return { kind: 'file', path, content, recordLine }
  }
  if (type === 'directory') {
    const c = att.content
    return { kind: 'directory', path, content: typeof c === 'string' ? c : undefined, recordLine }
  }
  if (type === 'pdf_reference') {
    const pages = typeof att.pageCount === 'number' ? `${att.pageCount} pages` : undefined
    return { kind: 'pdf', path, content: pages, recordLine }
  }
  return undefined
}

export const MENTION_ATTACHMENT_TYPES = new Set(['file', 'directory', 'pdf_reference'])
