// The texts a renderer shows for an item, in display order. The search index is built from these same
// parts (joined with "\n"), so the k-th match the worker reports is the k-th `<mark>` the UI draws and the
// active one can be ringed. Keep renderers and these helpers in step.
import { displayToolName } from './tools'
import type { ToolBlock, ToolResult, UserPrompt } from './types'
import { splitLines, stripCatN, tagContent } from './util'

export interface TextPart {
  /** Stable name the renderer asks for (`command`, `old`, `kv:path`…). */
  key: string
  text: string
}

const BASE64_RUN = /[A-Za-z0-9+/=]{200,}/g
const stripB64 = (s: string) => (s.length < 200 ? s : s.replace(BASE64_RUN, '[base64]'))

/** Pretty JSON with base64 payloads replaced by `[base64]` (what the generic input view shows). */
export function displayJson(v: unknown): string {
  if (v === undefined) return ''
  if (typeof v === 'string') return stripB64(v)
  try {
    return (
      JSON.stringify(
        v,
        (k, x: unknown) => {
          if (typeof x !== 'string') return x
          if (k === 'base64' || (k === 'data' && x.length > 64 && !x.includes(' '))) return '[base64]'
          return stripB64(x)
        },
        2,
      ) ?? String(v)
    )
  } catch {
    return String(v)
  }
}

const isRec = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const s = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

/** Option values shown as chips (strings only; numbers/booleans are not worth matching). */
function kv(input: Record<string, unknown>, keys: readonly string[]): TextPart[] {
  const out: TextPart[] = []
  for (const k of keys) {
    const v = input[k]
    if (typeof v === 'string' && v) out.push({ key: `kv:${k}`, text: v })
  }
  return out
}

function parts(...list: (TextPart | false | undefined | null)[]): TextPart[] {
  return list.filter((p): p is TextPart => !!p && p.text !== '')
}

const part = (key: string, text: string | undefined): TextPart | undefined =>
  text === undefined || text === '' ? undefined : { key, text }

/**
 * Visible texts of a tool_use input, in render order, after the card header's tool name (part `name`).
 * Tools without a dedicated renderer get a single `json` part.
 */
export function toolInputParts(name: string, input: unknown): TextPart[] {
  const head: TextPart = { key: 'name', text: displayToolName(name) }
  const rest = isRec(input) ? specificParts(name, input) : undefined
  return [head, ...(rest ?? parts(part('json', displayJson(input))))]
}

function specificParts(name: string, input: Record<string, unknown>): TextPart[] | undefined {
  switch (name) {
    case 'Bash': {
      const command = s(input.command)
      if (command === undefined) return undefined
      return parts(part('description', s(input.description)), part('command', command))
    }
    case 'Read': {
      const path = s(input.file_path) ?? s(input.path)
      return path ? parts(part('path', path), ...kv(input, ['pages'])) : undefined
    }
    case 'Edit': {
      const path = s(input.file_path)
      const oldS = s(input.old_string)
      const newS = s(input.new_string)
      if (!path || oldS === undefined || newS === undefined) return undefined
      return parts(part('path', path), part('old', oldS), part('new', newS))
    }
    case 'MultiEdit': {
      const path = s(input.file_path)
      const edits = Array.isArray(input.edits) ? input.edits : undefined
      if (!path || !edits) return undefined
      return parts(
        part('path', path),
        ...edits.flatMap((e, i) => [
          part(`old:${i}`, s(isRec(e) ? e.old_string : undefined)),
          part(`new:${i}`, s(isRec(e) ? e.new_string : undefined)),
        ]),
      )
    }
    case 'Write': {
      const path = s(input.file_path)
      const content = s(input.content)
      if (!path || content === undefined) return undefined
      return parts(part('path', path), part('content', content))
    }
    case 'Grep':
    case 'Glob': {
      const pattern = s(input.pattern)
      if (pattern === undefined) return undefined
      const others = Object.keys(input).filter((k) => k !== 'pattern')
      return parts(part('pattern', pattern), ...kv(input, others))
    }
    case 'Agent':
    case 'Task':
      return parts(
        part('description', s(input.description)),
        ...kv(input, ['subagent_type', 'model']),
        part('prompt', s(input.prompt)),
      )
    case 'WebFetch': {
      const url = s(input.url)
      return url ? parts(part('url', url), part('prompt', s(input.prompt))) : undefined
    }
    case 'AskUserQuestion': {
      if (!Array.isArray(input.questions)) return undefined
      const out: TextPart[] = []
      input.questions.forEach((q, qi) => {
        if (!isRec(q) || !s(q.question)) return
        out.push(...parts(part(`q${qi}:header`, s(q.header)), part(`q${qi}`, s(q.question))))
        const options = Array.isArray(q.options) ? q.options : []
        options.forEach((o, oi) => {
          const label = isRec(o) ? s(o.label) : s(o)
          if (!label) return
          out.push(
            ...parts(
              part(`q${qi}:o${oi}`, label),
              part(`q${qi}:o${oi}:d`, isRec(o) ? s(o.description) : undefined),
            ),
          )
        })
      })
      return out
    }
    case 'TodoWrite': {
      if (!Array.isArray(input.todos)) return undefined
      return input.todos.flatMap((t, i) => {
        if (!isRec(t) || !s(t.content)) return []
        const shown = t.status === 'in_progress' && s(t.activeForm) ? s(t.activeForm) : s(t.content)
        return parts(part(`todo:${i}`, shown))
      })
    }
    case 'WebSearch': {
      const q = s(input.query)
      return q ? parts(part('query', q)) : undefined
    }
    default:
      return undefined
  }
}

/** What the task-notification card shows: summary · status in the header, the result as its body. */
export function notificationParts(p: UserPrompt): { summary?: string; status?: string; result: string } {
  const raw = p.rawText
  const text = p.segments
    .flatMap((x) => (x.kind === 'text' ? [x.text] : []))
    .join('\n')
    .trim()
  const summary = p.notification?.summary ?? tagContent(raw, 'summary')?.trim()
  const rawStatus = p.notification?.status ?? tagContent(raw, 'status')?.trim()
  // "… completed" summaries already say it; the status is then not shown (or indexed) twice.
  const status =
    rawStatus && !(summary ?? '').toLowerCase().includes(rawStatus.toLowerCase()) ? rawStatus : undefined
  // Without a <result>, the body is whatever surrounds the tag block (e.g. "Read the output file…").
  const outside = text.replace(/<task-notification>[\s\S]*?<\/task-notification>/g, '').trim()
  const result = tagContent(raw, 'result')?.trim() ?? (summary ? outside : text || raw)
  return { summary, status, result }
}

/** The slash-command chip label (`/name args`) and its expandable output (message + stdout). */
export function slashCommandParts(command: NonNullable<UserPrompt['command']>): {
  label: string
  output: string
} {
  const name = command.name ? (command.name.startsWith('/') ? command.name : `/${command.name}`) : '/command'
  const label = command.args ? `${name} ${command.args}` : name
  const output = [command.message, command.stdout].filter(Boolean).join('\n').trim()
  return { label, output }
}

// ------------------------------------------------------------------------------------ tool results

/** Text blocks of a tool result, joined (what the model saw). */
export function toolResultText(result: ToolResult | undefined): string {
  if (!result) return ''
  return result.content.flatMap((c) => (c.type === 'text' ? [c.text] : [])).join('\n')
}

const EXIT_RE = /^(?:Error: )?Exit code (\d+)\s*\n?/

/** Bash stdout / stderr / exit code, from `toolUseResult` when present, else from the result text. */
export function bashOutput(result: ToolResult): { stdout?: string; stderr?: string; exitCode?: number } {
  const st = isRec(result.structured) ? result.structured : undefined
  const source = toolResultText(result) || s(result.structured) || ''
  const exitMatch = EXIT_RE.exec(source)
  const exitCode = exitMatch ? Number(exitMatch[1]) : undefined
  const body = exitMatch ? source.slice(exitMatch[0].length) : source
  let stdout = s(st?.stdout)
  let stderr = s(st?.stderr)
  if (!st) {
    if (result.isError) stderr = body
    else stdout = body
  } else if (result.isError && !stdout?.trim() && !stderr?.trim()) stderr = body
  return { stdout, stderr, exitCode }
}

/** Line texts of a `structuredPatch` as the diff view lists them (no hunk headers, no +/- signs). */
export function patchLineTexts(structuredPatch: unknown): string[] | undefined {
  if (!Array.isArray(structuredPatch)) return undefined
  const out: string[] = []
  let hunks = 0
  for (const h of structuredPatch) {
    const lines = isRec(h) && Array.isArray(h.lines) ? h.lines : undefined
    if (!lines) continue
    hunks++
    for (const l of lines) {
      if (typeof l !== 'string') continue
      out.push(l[0] === '+' || l[0] === '-' || l[0] === ' ' ? l.slice(1) : l[0] === '\\' ? l : l.slice(1))
    }
  }
  return hunks > 0 ? out : undefined
}

export interface QuestionView {
  question: string
  header?: string
  options: { label: string; description?: string }[]
  multiSelect?: boolean
}

export function toQuestionViews(v: unknown): QuestionView[] | undefined {
  if (!Array.isArray(v)) return undefined
  return v.flatMap((q) => {
    const question = isRec(q) ? s(q.question) : undefined
    if (!isRec(q) || !question) return []
    const options = (Array.isArray(q.options) ? q.options : []).flatMap((o) => {
      const label = (isRec(o) ? s(o.label) : undefined) ?? s(o)
      return label ? [{ label, description: isRec(o) ? s(o.description) : undefined }] : []
    })
    return [
      { question, header: s(q.header), options, multiSelect: q.multiSelect === true ? true : undefined },
    ]
  })
}

/** Whether `label` is (one of) the chosen answer(s). */
export function isChosen(answer: string | undefined, label: string, multi?: boolean): boolean {
  if (answer === undefined) return false
  if (answer === label) return true
  return Boolean(multi) && answer.split(/,\s*/).includes(label)
}

/** Answers keyed by question, stringified. */
export function answerStrings(v: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (isRec(v)) for (const [k, x] of Object.entries(v)) out[k] = typeof x === 'string' ? x : JSON.stringify(x)
  return out
}

/** Texts QuestionsView renders, in order: header, question, option labels + descriptions, "Other" answer. */
export function questionTexts(questions: QuestionView[], answers?: Record<string, string>): string[] {
  const out: string[] = []
  for (const q of questions) {
    if (q.header) out.push(q.header)
    out.push(q.question)
    for (const o of q.options) {
      out.push(o.label)
      if (o.description) out.push(o.description)
    }
    const answer = answers?.[q.question]
    if (answer !== undefined && !q.options.some((o) => isChosen(answer, o.label, q.multiSelect)))
      out.push(answer)
  }
  return out
}

/** Todo texts as the checklist shows them (`activeForm` for the in-progress item). */
export function todoTexts(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined
  return v.flatMap((t) => {
    if (!isRec(t) || !s(t.content)) return []
    const status = s(t.status) ?? 'pending'
    return [(status === 'in_progress' && s(t.activeForm)) || (s(t.content) as string)]
  })
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []

/**
 * Visible texts of a tool result, in render order (ToolResultView mirrors this: each renderer picks the
 * same source). `handback` is the Agent card body.
 */
export function toolResultParts(block: ToolBlock): TextPart[] {
  const r = block.result
  if (block.subagent?.handback) return [{ key: 'agent', text: block.subagent.handback }]
  if (!r) return []
  const text = toolResultText(r)
  const st = isRec(r.structured) ? r.structured : undefined
  if (r.denied) {
    return parts(
      part('denied', r.denied),
      text && text.trim() !== r.denied.trim() ? part('text', text) : undefined,
    )
  }
  return specificResultParts(block, r, st, text) ?? defaultResultParts(r, text)
}

function defaultResultParts(r: ToolResult, text: string): TextPart[] {
  if (text.trim()) return [{ key: 'text', text }]
  const structured = s(r.structured)
  if (structured) return [{ key: 'text', text: structured }]
  if (r.structured !== undefined) return [{ key: 'text', text: displayJson(r.structured) }]
  const unknown = r.content.filter((c) => c.type === 'unknown')
  if (unknown.length) return [{ key: 'text', text: displayJson(unknown.map((u) => u.raw)) }]
  return []
}

function specificResultParts(
  block: ToolBlock,
  r: ToolResult,
  st: Record<string, unknown> | undefined,
  text: string,
): TextPart[] | undefined {
  switch (block.name) {
    case 'Bash': {
      const { stdout, stderr } = bashOutput(r)
      return parts(
        stdout?.trim() ? part('stdout', stdout) : undefined,
        stderr?.trim() ? part('stderr', stderr) : undefined,
      )
    }
    case 'Edit':
    case 'MultiEdit':
    case 'Write': {
      if (r.isError) return undefined
      const lines = patchLineTexts(st?.structuredPatch)
      if (lines) return [{ key: 'patch', text: lines.join('\n') }]
      if (st?.type === 'create') return parts(part('path', s(st.filePath)))
      return undefined
    }
    case 'Read': {
      if (r.isError) return undefined
      const file = isRec(st?.file) ? st.file : undefined
      if (st?.type === 'text' && file)
        return [{ key: 'code', text: splitLines(s(file.content) ?? '').join('\n') }]
      if (st?.type === 'image' && file && s(file.base64)) return []
      if (st?.type === 'pdf' || st?.type === 'parts') return parts(part('path', s(file?.filePath)))
      if (!text.trim()) return r.content.some((c) => c.type === 'image') ? [] : undefined
      const { lines, stripped } = stripCatN(text)
      return stripped ? [{ key: 'code', text: lines.join('\n') }] : undefined
    }
    case 'Grep': {
      if (r.isError || !st) return undefined
      const files = strings(st.filenames)
      const content = s(st.content)
      if (st.mode === 'content' || (content && files.length === 0))
        return parts(part('content', content ?? text))
      return parts(part('files', files.join('\n')))
    }
    case 'Glob':
      if (r.isError || !st) return undefined
      return parts(part('files', strings(st.filenames).join('\n')))
    case 'WebSearch': {
      if (r.isError || !st || !Array.isArray(st.results)) return undefined
      const titles: string[] = []
      const texts: string[] = []
      for (const x of st.results) {
        if (typeof x === 'string') {
          if (x.trim()) texts.push(x)
          continue
        }
        for (const c of isRec(x) && Array.isArray(x.content) ? x.content : []) {
          const url = isRec(c) ? s(c.url) : undefined
          if (url) titles.push((isRec(c) && s(c.title)) || url)
        }
      }
      if (titles.length === 0 && texts.length === 0) return undefined
      return parts(part('links', titles.join('\n')), ...texts.map((t, i) => part(`text:${i}`, t)))
    }
    case 'WebFetch':
      if (r.isError || !st) return undefined
      return parts(part('md', s(st.result)))
    case 'AskUserQuestion': {
      if (r.isError || !st) return undefined
      const input = isRec(block.input) ? block.input : undefined
      const questions = toQuestionViews(st.questions) ?? toQuestionViews(input?.questions)
      if (!questions) return undefined
      return parts(part('questions', questionTexts(questions, answerStrings(st.answers)).join('\n')))
    }
    case 'TodoWrite': {
      if (r.isError || !st) return undefined
      const todos = todoTexts(st.newTodos)
      return todos ? parts(part('todos', todos.join('\n'))) : undefined
    }
    case 'Agent':
    case 'Task':
      if (block.subagent || (st && s(st.agentId) && !r.isError)) return parts(part('agent', text))
      return undefined
    default:
      return undefined
  }
}
