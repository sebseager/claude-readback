import { memo, type ReactNode } from 'react'
import { countMatches, highlightText } from '@/components/common/highlight'
import { safeHref } from '@/components/common/url'
import { displayJson } from '@/lib/transcript/searchText'
import type { ToolBlock } from '@/lib/transcript/types'
import { useSearchQuery } from '../chatStore'
import { AFTER_FIRST, useToolInputActive, type PartActive } from './partsActive'
import { asArray, asBool, asRecord, asString, type Rec } from '../util'
import { CollapsibleMarkdown } from './CollapsibleMarkdown'
import { ClampedText } from './ClampedText'
import { stringsToHunk, toHunks } from './diff'
import { DiffView } from './DiffView'
import { KeyValueChips } from './KeyValueChips'
import { PathLine } from './PathLine'
import { QuestionsView } from './QuestionsView'
import { StringsDisclosure } from './StringsDisclosure'
import { toQuestions, toTodos } from './shapes'
import { TodoList } from './TodoList'

type InputProps = {
  block: ToolBlock
  input: Rec
  query: string
  /**
   * Search occurrence to ring inside the part named `key` (see `toolInputParts`: the index is built from
   * the same parts, so occurrences line up with what is rendered here).
   */
  a: PartActive
}

/** Per-tool rendering of a tool_use input; falls back to pretty JSON. */
export const ToolInput = memo(function ToolInput({ block }: { block: ToolBlock }) {
  const a = useToolInputActive(block)
  const query = useSearchQuery()
  const input = asRecord(block.input)
  const render = input ? INPUT_RENDERERS[block.name] : undefined
  const out = render && input ? render({ block, input, a, query }) : null
  if (out) return out
  return (
    <ClampedText
      id={`${block.id}:input`}
      text={displayJson(block.input)}
      title={`${block.name} input`}
      activeIndex={a('json')}
    />
  )
})

function bashInput({ block, input, a, query }: InputProps) {
  const command = asString(input.command)
  if (command === undefined) return null
  const description = asString(input.description)
  return (
    <div className="flex flex-col gap-1.5">
      {description && (
        <p className="text-[13px] wrap-anywhere text-fg-secondary">
          {highlightText(description, query, a('description'))}
        </p>
      )}
      <ClampedText id={`${block.id}:cmd`} text={command} title="Command" activeIndex={a('command')} />
      <KeyValueChips
        entries={[
          ['timeout', input.timeout],
          ['background', input.run_in_background],
        ]}
      />
    </div>
  )
}

function readInput({ input, a }: InputProps) {
  const path = asString(input.file_path) ?? asString(input.path)
  if (!path) return null
  return (
    <div className="flex flex-col gap-1.5">
      <PathLine path={path} activeIndex={a('path')} />
      <KeyValueChips
        entries={[
          ['offset', input.offset],
          ['limit', input.limit],
          ['pages', input.pages],
        ]}
        activeFor={(k) => a(`kv:${k}`)}
      />
    </div>
  )
}

/** Ring position over old + new strings (the diff lists old lines, then new lines). */
function pairActive(oldS: string, query: string, oldA: number | undefined, newA: number | undefined) {
  if (oldA !== undefined) return oldA
  return newA === undefined ? undefined : countMatches(oldS, query) + newA
}

/** The Result section will show the applied patch (so the Input need not repeat the strings). */
function hasPatch(block: ToolBlock): boolean {
  const r = block.result
  return !!r && !r.isError && toHunks(asRecord(r.structured)?.structuredPatch).length > 0
}

const lineCount = (s: string) => (s === '' ? 0 : s.split('\n').length)

function editInput({ block, input, a, query }: InputProps) {
  const path = asString(input.file_path)
  const oldS = asString(input.old_string)
  const newS = asString(input.new_string)
  if (!path || oldS === undefined || newS === undefined) return null
  const active = pairActive(oldS, query, a('old'), a('new'))
  const diff = (
    <DiffView
      id={`${block.id}:input-diff`}
      hunks={[stringsToHunk(oldS, newS)]}
      showHunkHeaders={false}
      showNumbers={false}
      title={path}
      activeIndex={active}
    />
  )
  return (
    <div className="flex flex-col gap-1.5">
      <PathLine path={path} activeIndex={a('path')} />
      {hasPatch(block) ? (
        <StringsDisclosure
          id={`${block.id}:strings`}
          label={
            <>
              old → new strings{' '}
              <span className="tabular-nums">
                · −{lineCount(oldS)} +{lineCount(newS)}
              </span>
            </>
          }
          hits={query.trim() ? countMatches(oldS, query) + countMatches(newS, query) : 0}
          activeIndex={active}
        >
          {diff}
        </StringsDisclosure>
      ) : (
        diff
      )}
      <KeyValueChips entries={[['replace all', asBool(input.replace_all)]]} />
    </div>
  )
}

function multiEditInput({ block, input, a, query }: InputProps) {
  const path = asString(input.file_path)
  const edits = asArray(input.edits)?.map(asRecord)
  if (!path || !edits) return null
  const pairs = edits.map((e) => ({
    oldS: asString(e?.old_string) ?? '',
    newS: asString(e?.new_string) ?? '',
  }))
  const actives = pairs.map((p, i) => pairActive(p.oldS, query, a(`old:${i}`), a(`new:${i}`)))
  const diffs = pairs.map((p, i) => (
    <DiffView
      key={i}
      id={`${block.id}:input-diff-${i}`}
      hunks={[stringsToHunk(p.oldS, p.newS)]}
      showHunkHeaders={false}
      showNumbers={false}
      title={path}
      activeIndex={actives[i]}
    />
  ))
  const anyActive = actives.find((x) => x !== undefined)
  return (
    <div className="flex flex-col gap-1.5">
      <PathLine path={path} activeIndex={a('path')} />
      {hasPatch(block) ? (
        <StringsDisclosure
          id={`${block.id}:strings`}
          label={`old → new strings · ${edits.length} edit${edits.length === 1 ? '' : 's'}`}
          hits={
            query.trim()
              ? pairs.reduce((n, p) => n + countMatches(p.oldS, query) + countMatches(p.newS, query), 0)
              : 0
          }
          activeIndex={anyActive}
        >
          {diffs}
        </StringsDisclosure>
      ) : (
        diffs
      )}
    </div>
  )
}

function writeInput({ block, input, a }: InputProps) {
  const path = asString(input.file_path)
  const content = asString(input.content)
  if (!path || content === undefined) return null
  return (
    <div className="flex flex-col gap-1.5">
      <PathLine path={path} activeIndex={a('path')} />
      <ClampedText id={`${block.id}:content`} text={content} title={path} activeIndex={a('content')} />
    </div>
  )
}

function patternInput({ input, a, query }: InputProps) {
  const pattern = asString(input.pattern)
  if (pattern === undefined) return null
  const { pattern: _p, ...rest } = input
  return (
    <div className="flex flex-col gap-1.5">
      <code className="self-start rounded-md bg-bubble/70 px-2 py-1 font-mono text-[12.5px] break-all text-fg">
        {highlightText(pattern, query, a('pattern'))}
      </code>
      <KeyValueChips entries={Object.entries(rest)} activeFor={(k) => a(`kv:${k}`)} />
    </div>
  )
}

function agentInput({ block, input, a, query }: InputProps) {
  const prompt = asString(input.prompt)
  const description = asString(input.description)
  const keys: Record<string, string> = { type: 'subagent_type', model: 'model' }
  return (
    <div className="flex flex-col gap-2">
      {description && (
        <p className="text-[13px] font-medium wrap-anywhere text-fg">
          {highlightText(description, query, a('description'))}
        </p>
      )}
      <KeyValueChips
        entries={[
          ['type', input.subagent_type],
          ['model', input.model],
          ['background', input.run_in_background],
        ]}
        activeFor={(k) => (keys[k] ? a(`kv:${keys[k]}`) : undefined)}
      />
      {prompt && (
        <CollapsibleMarkdown
          id={`${block.id}:prompt`}
          label="Prompt"
          markdown={prompt}
          activeIndex={a('prompt')}
        />
      )}
    </div>
  )
}

function webFetchInput({ input, query, a }: InputProps) {
  const url = asString(input.url)
  if (!url) return null
  const href = safeHref(url)
  const prompt = asString(input.prompt)
  return (
    <div className="flex flex-col gap-1.5">
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="truncate font-mono text-[12.5px] text-fg-secondary underline decoration-border underline-offset-2 hover:decoration-fg-muted"
        >
          {highlightText(url, query, a('url'))}
        </a>
      ) : (
        <code className="font-mono text-[12.5px] break-all text-fg-secondary">
          {highlightText(url, query, a('url'))}
        </code>
      )}
      {prompt && (
        <p className="text-[13px] wrap-anywhere text-fg-secondary">
          {highlightText(prompt, query, a('prompt'))}
        </p>
      )}
    </div>
  )
}

function webSearchInput({ input, a, query }: InputProps) {
  const q = asString(input.query)
  if (!q) return null
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[13px] wrap-anywhere text-fg">“{highlightText(q, query, a('query'))}”</p>
      <KeyValueChips
        entries={[
          ['allowed', input.allowed_domains],
          ['blocked', input.blocked_domains],
        ]}
      />
    </div>
  )
}

// Questions and todos render many small parts inline and count occurrences themselves
// (sequentialHighlighter), so they take one running occurrence over every part after the name.
function askInput({ input, a }: InputProps) {
  const questions = toQuestions(input.questions)
  if (!questions) return null
  return <QuestionsView questions={questions} activeIndex={a(AFTER_FIRST)} />
}

function todoInput({ input, a }: InputProps) {
  const todos = toTodos(input.todos)
  if (!todos) return null
  return <TodoList todos={todos} activeIndex={a(AFTER_FIRST)} />
}

const INPUT_RENDERERS: Record<string, (p: InputProps) => ReactNode> = {
  Bash: bashInput,
  Read: readInput,
  Edit: editInput,
  MultiEdit: multiEditInput,
  Write: writeInput,
  Grep: patternInput,
  Glob: patternInput,
  Agent: agentInput,
  Task: agentInput,
  WebFetch: webFetchInput,
  WebSearch: webSearchInput,
  AskUserQuestion: askInput,
  TodoWrite: todoInput,
}
