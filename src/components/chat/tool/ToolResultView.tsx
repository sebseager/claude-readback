import { Maximize2 } from 'lucide-react'
import { memo, useMemo, useState, type ReactNode } from 'react'
import { elapsedMs, formatDuration } from '@/components/common/format'
import { highlightText } from '@/components/common/highlight'
import { Button } from '@/components/ui/button'
import {
  answerStrings,
  bashOutput,
  displayJson,
  toolResultParts,
  toQuestionViews,
} from '@/lib/transcript/searchText'
import type { SubagentRef, ToolBlock, ToolResult } from '@/lib/transcript/types'
import { useChatContext } from '../chatContext'
import { useSearchQuery } from '../chatStore'
import { Markdown } from '../Markdown'
import { TextViewerDialog } from '../TextViewerDialog'
import { asArray, asBool, asNumber, asRecord, asString, type Rec } from '../util'
import { ClampedText } from './ClampedText'
import { CodeView } from './CodeView'
import { toHunks } from './diff'
import { DiffView } from './DiffView'
import { FileList } from './FileList'
import { stripCatN, splitLines } from './lines'
import { LinkList, type Link } from './LinkList'
import { Note } from './Note'
import { QuestionsView } from './QuestionsView'
import { ResultImages } from './ResultImages'
import { usePartsActive, type PartActive } from './partsActive'
import { toTodos } from './shapes'
import { SubagentCard } from './SubagentCard'
import { TerminalPane } from './TerminalPane'
import { TodoList } from './TodoList'
import { ToolAttachments } from './ToolAttachments'
import { resultText } from './toolMeta'

type ResultProps = {
  block: ToolBlock
  result: ToolResult
  /** `result.structured` when it is an object. */
  st: Rec | undefined
  text: string
  /** Ring position per part (see `toolResultParts`, which the search index is built from). */
  a: PartActive
  query: string
}

/** The Result section body: notes, a rich per-tool renderer (or text/JSON), images, attachments. */
export const ToolResultView = memo(function ToolResultView({ block }: { block: ToolBlock }) {
  const parts = useMemo(() => toolResultParts(block), [block])
  const a = usePartsActive(parts, block.id, 'tool-result')
  const query = useSearchQuery()
  const result = block.result
  if (!result) {
    return (
      <>
        <p className="text-[12.5px] text-fg-muted italic">
          No result recorded — the session ended or the call was interrupted.
        </p>
        <ToolAttachments blockId={block.id} attachments={block.attachments} />
      </>
    )
  }
  const text = resultText(result)
  const st = asRecord(result.structured)
  const props: ResultProps = { block, result, st, text, a, query }
  let body: ReactNode = null
  if (result.denied) {
    body =
      text && text.trim() !== result.denied.trim() ? (
        <ClampedText id={`${block.id}:result`} text={text} tone="muted" activeIndex={a('text')} />
      ) : null
  } else {
    const render = RESULT_RENDERERS[block.name]
    body = (render && render(props)) || defaultResult(props)
  }
  return (
    <div className="flex flex-col gap-2">
      {result.denied && (
        <Note tone="danger">
          <span className="font-medium">Denied.</span> {highlightText(result.denied, query, a('denied'))}
        </Note>
      )}
      {result.persistedPath && (
        <Note>
          Output was truncated; full output saved to{' '}
          <code className="font-mono text-[12px] break-all">{result.persistedPath}</code>
        </Note>
      )}
      {body}
      {block.name !== 'Read' && <ResultImages content={result.content} />}
      <ToolAttachments blockId={block.id} attachments={block.attachments} />
    </div>
  )
})

function defaultResult({ block, result, text, a }: ResultProps): ReactNode {
  const active = a('text')
  const id = `${block.id}:result`
  const structuredText = asString(result.structured)
  if (text.trim())
    return (
      <ClampedText
        id={id}
        text={text}
        tone={result.isError ? 'danger' : 'default'}
        title={`${block.name} result`}
        activeIndex={active}
      />
    )
  if (structuredText)
    return (
      <ClampedText
        id={id}
        text={structuredText}
        tone={result.isError ? 'danger' : 'default'}
        activeIndex={active}
      />
    )
  if (result.structured !== undefined)
    return (
      <ClampedText
        id={id}
        text={displayJson(result.structured)}
        title={`${block.name} result`}
        activeIndex={active}
      />
    )
  const unknown = result.content.filter((c) => c.type === 'unknown')
  if (unknown.length)
    return <ClampedText id={id} text={displayJson(unknown.map((u) => u.raw))} activeIndex={active} />
  if (result.content.some((c) => c.type === 'image')) return null
  return <p className="text-[12.5px] text-fg-muted italic">(empty result)</p>
}

function bashResult({ block, result, st, a }: ResultProps): ReactNode {
  const { stdout, stderr, exitCode } = bashOutput(result)
  const timedOut = asNumber(st?.timedOutAfterMs)
  const note = [
    asString(st?.returnCodeInterpretation),
    timedOut ? `timed out after ${formatDuration(timedOut)}` : undefined,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <TerminalPane
      id={block.id}
      stdout={stdout}
      stderr={stderr}
      exitCode={exitCode}
      interrupted={asBool(st?.interrupted)}
      note={note || undefined}
      activeIndex={a('stdout')}
      stderrActiveIndex={a('stderr')}
    />
  )
}

function patchResult({ block, result, st, a, query }: ResultProps): ReactNode {
  if (result.isError) return null
  const hunks = toHunks(st?.structuredPatch)
  const path = asString(st?.filePath)
  if (hunks.length > 0)
    return <DiffView id={`${block.id}:diff`} hunks={hunks} title={path} activeIndex={a('patch')} />
  if (st?.type === 'create') {
    const n = splitLines(asString(st.content) ?? '').length
    return (
      <p className="text-[12.5px] text-fg-secondary">
        Created {path ? <code className="font-mono">{highlightText(path, query, a('path'))}</code> : 'file'} ·{' '}
        {n} lines
      </p>
    )
  }
  return null
}

function readResult({ block, result, st, text, a, query }: ResultProps): ReactNode {
  const active = a('code')
  if (result.isError) return null
  const file = asRecord(st?.file)
  const id = `${block.id}:code`
  if (st?.type === 'text' && file) {
    const content = asString(file.content) ?? ''
    return (
      <CodeView
        id={id}
        lines={splitLines(content)}
        startLine={asNumber(file.startLine) ?? 1}
        title={asString(file.filePath)}
        activeIndex={active}
      />
    )
  }
  if (st?.type === 'image' && file && asString(file.base64)) {
    const mediaType = asString(file.type) ?? 'image/png'
    const dims = asRecord(file.dimensions)
    return (
      <div className="flex flex-col gap-1.5">
        <img
          src={`data:${mediaType};base64,${asString(file.base64)}`}
          alt="Image read by the tool"
          className="max-h-72 max-w-full self-start rounded-lg border border-border bg-bubble object-contain"
        />
        {dims && (
          <span className="text-[11.5px] text-fg-muted">
            {asNumber(dims.originalWidth)}×{asNumber(dims.originalHeight)} · {mediaType}
          </span>
        )}
      </div>
    )
  }
  if (st?.type === 'pdf' || st?.type === 'parts') {
    const size = asNumber(file?.originalSize)
    return (
      <div className="flex flex-col gap-1.5">
        <Note>
          PDF{' '}
          {asString(file?.filePath) ? (
            <code className="font-mono">
              {highlightText(asString(file?.filePath) ?? '', query, a('path'))}
            </code>
          ) : (
            ''
          )}
          {size ? ` · ${(size / 1024).toFixed(0)} KB` : ''} — rendered for the model; not previewed here.
        </Note>
        <ResultImages content={result.content} />
      </div>
    )
  }
  const images = result.content.some((c) => c.type === 'image')
  if (images && !text.trim()) return <ResultImages content={result.content} />
  if (!text.trim()) return null
  const { startLine, lines, stripped } = stripCatN(text)
  if (!stripped) return null
  return <CodeView id={id} lines={lines} startLine={startLine} activeIndex={active} />
}

function strings(v: unknown): string[] {
  return (asArray(v) ?? []).filter((x): x is string => typeof x === 'string')
}

function grepResult({ block, result, st, text, a }: ResultProps): ReactNode {
  if (result.isError || !st) return null
  const mode = asString(st.mode)
  const files = strings(st.filenames)
  const numMatches = asNumber(st.numMatches)
  const summary = [
    `${asNumber(st.numFiles) ?? files.length} file${(asNumber(st.numFiles) ?? files.length) === 1 ? '' : 's'}`,
    numMatches !== undefined ? `${numMatches} matches` : undefined,
    asBool(st.truncated) || asNumber(st.appliedLimit) ? 'limited' : undefined,
  ]
    .filter(Boolean)
    .join(' · ')
  const content = asString(st.content)
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11.5px] text-fg-muted">{summary}</span>
      {mode === 'content' || (content && files.length === 0) ? (
        <ClampedText
          id={`${block.id}:grep`}
          text={content ?? text}
          title="Matches"
          activeIndex={a('content')}
        />
      ) : (
        <FileList id={`${block.id}:files`} files={files} activeIndex={a('files')} />
      )}
    </div>
  )
}

function globResult({ block, result, st, a }: ResultProps): ReactNode {
  if (result.isError || !st) return null
  const files = strings(st.filenames)
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11.5px] text-fg-muted">
        {asNumber(st.numFiles) ?? files.length} files
        {asBool(st.truncated) ? ' · truncated' : ''}
        {asNumber(st.durationMs) !== undefined ? ` · ${formatDuration(asNumber(st.durationMs) ?? 0)}` : ''}
      </span>
      <FileList id={`${block.id}:files`} files={files} activeIndex={a('files')} />
    </div>
  )
}

function webSearchResult({ result, st, a }: ResultProps): ReactNode {
  if (result.isError || !st) return null
  const results = asArray(st.results)
  if (!results) return null
  const links: Link[] = []
  const texts: string[] = []
  for (const r of results) {
    if (typeof r === 'string') {
      if (r.trim()) texts.push(r)
      continue
    }
    for (const c of asArray(asRecord(r)?.content) ?? []) {
      const cr = asRecord(c)
      const url = asString(cr?.url)
      if (url) links.push({ url, title: asString(cr?.title) ?? url })
    }
  }
  if (links.length === 0 && texts.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      {links.length > 0 && <LinkList links={links} activeIndex={a('links')} />}
      {texts.map((t, i) => (
        <Markdown
          key={i}
          markdown={t}
          className="text-[13.5px] text-fg-secondary"
          activeIndex={a(`text:${i}`)}
        />
      ))}
    </div>
  )
}

function webFetchResult({ block, result, st, a }: ResultProps): ReactNode {
  if (result.isError || !st) return null
  const md = asString(st.result)
  const code = asNumber(st.code)
  const bytes = asNumber(st.bytes)
  const ms = asNumber(st.durationMs)
  const meta = [
    bytes !== undefined ? `${(bytes / 1024).toFixed(1)} KB` : undefined,
    ms !== undefined ? formatDuration(ms) : undefined,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-[11.5px]">
        {code !== undefined && (
          <span
            className={
              code < 400
                ? 'rounded-full bg-success/12 px-2 py-px font-mono text-success'
                : 'rounded-full bg-danger/10 px-2 py-px font-mono text-danger'
            }
          >
            {code} {asString(st.codeText) ?? ''}
          </span>
        )}
        {meta && <span className="text-fg-muted">{meta}</span>}
      </div>
      {md && <ScrollMarkdown id={block.id} markdown={md} activeIndex={a('md')} />}
    </div>
  )
}

function ScrollMarkdown({
  id,
  markdown,
  activeIndex,
}: {
  id: string
  markdown: string
  activeIndex?: number
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <div className="scrollbar-thin max-h-96 overflow-y-auto rounded-lg border border-border px-3 py-2">
        <Markdown markdown={markdown} className="text-[13.5px]" activeIndex={activeIndex} />
      </div>
      <Button
        variant="ghost"
        size="xs"
        className="mt-1 text-fg-muted hover:bg-hover hover:text-fg"
        onClick={() => setOpen(true)}
      >
        <Maximize2 />
        Open
      </Button>
      {open && (
        <TextViewerDialog
          open={open}
          onOpenChange={setOpen}
          title="Fetched content"
          description={id}
          text={markdown}
        />
      )}
    </div>
  )
}

function askResult({ block, result, st, a }: ResultProps): ReactNode {
  if (result.isError || !st) return null
  const questions = toQuestionViews(st.questions) ?? toQuestionViews(asRecord(block.input)?.questions)
  if (!questions) return null
  return (
    <QuestionsView questions={questions} answers={answerStrings(st.answers)} activeIndex={a('questions')} />
  )
}

function todoResult({ result, st, a }: ResultProps): ReactNode {
  if (result.isError || !st) return null
  const todos = toTodos(st.newTodos)
  return todos ? <TodoList todos={todos} activeIndex={a('todos')} /> : null
}

function agentResult({ block, result, st, text, a }: ResultProps): ReactNode {
  const ref: SubagentRef | undefined =
    block.subagent ??
    (st && asString(st.agentId)
      ? {
          agentId: asString(st.agentId) ?? '',
          toolUseId: block.id,
          description: asString(st.description) ?? asString(asRecord(block.input)?.description),
          model: asString(st.resolvedModel),
          status:
            st.status === 'completed' ? 'completed' : st.status === 'async_launched' ? 'launched' : 'unknown',
        }
      : undefined)
  if (!ref || (result.isError && !block.subagent)) return null
  const elapsed = asNumber(st?.totalDurationMs) ?? elapsedMs(block.startedAt, block.endedAt)
  return <SubagentSlot subagent={ref} elapsedMs={elapsed} resultText={text} activeIndex={a('agent')} />
}

function SubagentSlot({
  subagent,
  elapsedMs: elapsed,
  resultText,
  activeIndex,
}: {
  subagent: SubagentRef
  elapsedMs?: number
  resultText?: string
  activeIndex?: number
}) {
  const ctx = useChatContext()
  return (
    <SubagentCard
      subagent={subagent}
      elapsedMs={elapsed}
      resultText={resultText}
      activeIndex={activeIndex}
      renderTranscript={ctx?.renderSubagentTranscript}
      onOpen={ctx?.onOpenSubagent}
    />
  )
}

const RESULT_RENDERERS: Record<string, (p: ResultProps) => ReactNode> = {
  Bash: bashResult,
  Edit: patchResult,
  MultiEdit: patchResult,
  Write: patchResult,
  Read: readResult,
  Grep: grepResult,
  Glob: globResult,
  WebSearch: webSearchResult,
  WebFetch: webFetchResult,
  AskUserQuestion: askResult,
  TodoWrite: todoResult,
  Agent: agentResult,
  Task: agentResult,
}
