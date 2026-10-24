// Hand-written, fully invented Session for UI development and tests. Nothing here comes from a real
// transcript: the project ("acme-weather"), paths, ids and outputs are made up.
import { buildSearchIndex } from './search'
import type {
  AbandonedBranch,
  AssistantItem,
  Block,
  CompactionItem,
  EventItem,
  HiddenContextItem,
  QueuedUserItem,
  RawRecord,
  SearchEntry,
  Session,
  SubagentRef,
  ToolAttachment,
  ToolBlock,
  ToolResult,
  ToolResultContent,
  Turn,
  Usage,
} from './types'

/** 40×32 PNG: a terracotta sun on a warm gradient. */
export const MOCK_PNG_SUN =
  'iVBORw0KGgoAAAANSUhEUgAAACgAAAAgCAIAAADvz61XAAAAyklEQVR42sXNSQ6CQBRF0bdLl+Ia1dhhA2g1VAOooHEJDhxqqF+jl5zxvXi/Ogq8ni0FnmNLgXFoKTA8IgXu90iB2y1SoO8DBbouUCC2IVc9n/3KjSBEn+Xv9SurAx+83MT1S56C814uOZanYJ2TS47lKZjGySXH8hS0dXLJsTwFZZ1ccixP4WIaueRYnkKtmzwT45wOKtXk+nvNjaC8WgqcLpYCx9pS4FAZChSlocDubCiwPWkKbI6aAuuDpsCqUBRY7hUFFjtF8QEGfKKKQ4Ja+wAAAABJRU5ErkJggg=='
/** 36×32 PNG: a tiny blue bar chart. */
export const MOCK_PNG_CHART =
  'iVBORw0KGgoAAAANSUhEUgAAACQAAAAgCAIAAAD1803ZAAAAP0lEQVR42mP49fMr3RDDqGWjltHMsqzZZ9DQqGWjllHLMlI1j1o2atmoZdSzjFTxUcuGnmW4xEctG7VshFoGAG6FZRLWEiSaAAAAAElFTkSuQmCC'

const SESSION_ID = 'mock-5e55-4a1c-9d2e-000000000001'
const CWD = '/home/dev/acme-weather'

// ---- builder ---------------------------------------------------------------------------------------

class Builder {
  raw: RawRecord[] = []
  private uuidN = 0
  private parent: string | null = null

  uuid(): string {
    this.uuidN++
    return `mock-uuid-${String(this.uuidN).padStart(4, '0')}`
  }

  /** Appends a raw record and returns its 0-based line. */
  record(
    type: string,
    at: string,
    fields: Record<string, unknown> = {},
    withUuid = true,
  ): { line: number; uuid?: string } {
    const line = this.raw.length
    const uuid = withUuid ? this.uuid() : undefined
    const rec: RawRecord = {
      line,
      type,
      ...(uuid ? { uuid, parentUuid: this.parent } : {}),
      timestamp: at,
      sessionId: SESSION_ID,
      cwd: CWD,
      version: '2.1.295',
      gitBranch: 'feat/forecast-retry',
      ...fields,
    }
    if (uuid) this.parent = uuid
    this.raw.push(rec)
    return { line, uuid }
  }
}

const at = (min: number, sec = 0, ms = 0) => new Date(Date.UTC(2026, 9, 24, 9, min, sec, ms)).toISOString()

const usage = (
  inputTokens: number,
  cacheReadTokens: number,
  cacheWriteTokens: number,
  outputTokens: number,
  final = true,
): Usage => ({
  inputTokens,
  cacheReadTokens,
  cacheWriteTokens,
  outputTokens,
  final,
})

const text = (t: string): ToolResultContent[] => [{ type: 'text', text: t }]

function result(
  b: Builder,
  when: string,
  toolUseId: string,
  content: ToolResultContent[],
  opts: Partial<Pick<ToolResult, 'isError' | 'structured' | 'denied' | 'persistedPath'>> = {},
): ToolResult {
  const { line } = b.record('user', when, {
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: toolUseId, is_error: opts.isError ?? false, content }],
    },
    ...(opts.structured !== undefined ? { toolUseResult: opts.structured } : {}),
    ...(opts.denied ? { toolDenialKind: 'user-rejected' } : {}),
  })
  return { content, isError: opts.isError ?? false, recordLine: line, ...opts }
}

function tool(
  id: string,
  name: string,
  input: unknown,
  summary: string,
  startedAt: string,
  extra: Partial<Pick<ToolBlock, 'result' | 'attachments' | 'subagent' | 'endedAt'>> = {},
): ToolBlock {
  return { kind: 'tool', id, name, input, summary, attachments: [], startedAt, ...extra }
}

function attachment(
  b: Builder,
  when: string,
  id: string,
  type: string,
  label: string,
  body: string,
  toolUseID?: string,
): ToolAttachment {
  const { line } = b.record('attachment', when, { attachment: { type, toolUseID, content: body } })
  return { id, type, label, text: body, recordLine: line }
}

function assistant(
  b: Builder,
  id: string,
  blocks: Block[],
  startedAt: string,
  endedAt: string,
  opts: Partial<Omit<AssistantItem, 'kind' | 'id' | 'blocks' | 'startedAt' | 'endedAt' | 'recordLines'>> = {},
): AssistantItem {
  const model = opts.model ?? 'claude-opus-5-5'
  const recordLines = (blocks.length ? blocks : [null]).map(
    (block, i) =>
      b.record('assistant', startedAt, {
        requestId: opts.requestId ?? `req_mock_${id}`,
        apiBlockIndex: i,
        message: {
          id,
          model,
          role: 'assistant',
          content: block ? [blockToRaw(block)] : [],
          stop_reason: i === blocks.length - 1 ? (opts.stopReason ?? null) : null,
        },
      }).line,
  )
  return {
    kind: 'assistant',
    id,
    requestId: `req_mock_${id}`,
    model,
    effort: 'high',
    blocks,
    usage: usage(6, 24_000, 1_200, 320),
    stopReason: null,
    startedAt,
    endedAt,
    recordLines,
    ...opts,
  }
}

function blockToRaw(block: Block): unknown {
  switch (block.kind) {
    case 'text':
      return { type: 'text', text: block.markdown }
    case 'thinking':
      return { type: 'thinking', thinking: block.text, signature: 'c2lnbmF0dXJlLW1vY2s=' }
    case 'tool':
      return { type: 'tool_use', id: block.id, name: block.name, input: block.input }
    case 'fallback':
      return { type: 'fallback', from: { model: block.from }, to: { model: block.to } }
    case 'unknown':
      return block.raw
  }
}

function event(
  b: Builder,
  id: string,
  category: EventItem['category'],
  label: string,
  level: EventItem['level'],
  when: string,
  detail?: string,
): EventItem {
  const { line } = b.record('system', when, {
    subtype: category.replace('-', '_'),
    content: detail ?? label,
    level,
  })
  return { kind: 'event', id, category, label, level, at: when, detail, recordLines: [line] }
}

function hidden(b: Builder, id: string, label: string, body: string, when: string): HiddenContextItem {
  const { line } = b.record('attachment', when, {
    attachment: { type: label },
    rendered: [{ content: body }],
  })
  return { id, label, recordLine: line, text: body }
}

function promptRecord(b: Builder, when: string, rawText: string, extra: Record<string, unknown> = {}) {
  const { uuid } = b.record('user', when, {
    promptId: `prompt-${b.raw.length}`,
    message: { role: 'user', content: rawText },
    ...extra,
  })
  return uuid ?? ''
}

// ---- content ---------------------------------------------------------------------------------------

const FORECAST_TS = `// Forecast client for the upstream weather provider.
import { z } from 'zod'
import { getConfig } from '../config'
import { logger } from '../log'

const ForecastSchema = z.object({
  city: z.string(),
  updatedAt: z.string(),
  days: z.array(
    z.object({
      date: z.string(),
      highC: z.number(),
      lowC: z.number(),
      summary: z.string(),
      precipitationMm: z.number().default(0),
    }),
  ),
})

export type Forecast = z.infer<typeof ForecastSchema>

export class ForecastError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'ForecastError'
  }
}

/** Fetches the 7-day forecast for a city from the upstream provider. */
export async function fetchForecast(city: string, signal?: AbortSignal): Promise<Forecast> {
  const { forecastBaseUrl, apiKey } = getConfig()
  const url = new URL('/v2/forecast', forecastBaseUrl)
  url.searchParams.set('city', city)
  url.searchParams.set('days', '7')

  const res = await fetch(url, {
    headers: { authorization: \`Bearer \${apiKey}\` },
    signal,
  })

  if (!res.ok) {
    logger.warn('forecast request failed', { city, status: res.status })
    throw new ForecastError(\`Upstream returned \${res.status}\`, res.status)
  }

  const json: unknown = await res.json()
  const parsed = ForecastSchema.safeParse(json)
  if (!parsed.success) {
    logger.error('forecast payload invalid', { city, issues: parsed.error.issues.length })
    throw new ForecastError('Invalid forecast payload')
  }
  return parsed.data
}

export function isRetryable(err: unknown): boolean {
  return err instanceof ForecastError && (err.status === undefined || err.status >= 500)
}
`

const ERROR_LOG = `2026-10-24T08:12:03.114Z WARN forecast request failed city=Lisbon status=503
2026-10-24T08:12:03.115Z ERROR unhandled ForecastError: Upstream returned 503
    at fetchForecast (src/api/forecast.ts:41:11)
    at async loadDashboard (src/pages/dashboard.ts:18:20)
2026-10-24T08:12:09.402Z WARN forecast request failed city=Lisbon status=502
2026-10-24T08:12:09.403Z ERROR unhandled ForecastError: Upstream returned 502
    at fetchForecast (src/api/forecast.ts:41:11)
    at async loadDashboard (src/pages/dashboard.ts:18:20)`

const catN = (code: string, start = 1) =>
  code
    .replace(/\n$/, '')
    .split('\n')
    .map((l, i) => `${String(start + i).padStart(6)}\t${l}`)
    .join('\n')

const lineCount = (s: string) => s.replace(/\n$/, '').split('\n').length

const RETRY_TS = `export interface RetryOptions {
  retries: number
  baseDelayMs: number
  maxDelayMs: number
  signal?: AbortSignal
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(signal.reason)
    })
  })

/** Retries \`fn\` with exponential backoff and full jitter. */
export async function withRetry<T>(fn: () => Promise<T>, isRetryable: (e: unknown) => boolean, opts: RetryOptions): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt >= opts.retries || !isRetryable(err)) throw err
      const cap = Math.min(opts.maxDelayMs, opts.baseDelayMs * 2 ** attempt)
      await sleep(Math.random() * cap, opts.signal)
    }
  }
}
`

const FINAL_MARKDOWN = `## Retry with backoff is in

The forecast fetcher now retries **transient** upstream failures (5xx and network errors) with exponential backoff and full jitter. Client errors (4xx) still fail fast.

### What changed

1. New helper \`withRetry()\` in \`src/api/retry.ts\`
2. \`fetchForecast()\` wraps the request in \`withRetry\` and takes an optional \`retry\` option
3. The timeout is configurable through \`FORECAST_TIMEOUT_MS\` (default \`8000\`)
   - read once in \`getConfig()\`
   - applied with \`AbortSignal.timeout()\`

| Setting | Default | Env var |
|---|---|---|
| Retries | 3 | \`FORECAST_RETRIES\` |
| Base delay | 250 ms | \`FORECAST_RETRY_BASE_MS\` |
| Max delay | 4 s | \`FORECAST_RETRY_MAX_MS\` |
| Timeout | 8 s | \`FORECAST_TIMEOUT_MS\` |

Usage stays the same for callers:

\`\`\`ts
const forecast = await fetchForecast('Lisbon', { signal: controller.signal })
console.log(forecast.days[0].summary)
\`\`\`

To try the failure path locally:

\`\`\`bash
FORECAST_BASE_URL=http://localhost:4010 pnpm dev
# in another terminal: make the stub return 503 twice, then 200
curl -X POST localhost:4010/__stub -d '{"failures":2,"status":503}'
\`\`\`

The core of the change:

\`\`\`diff
-  const res = await fetch(url, { headers, signal })
+  const res = await withRetry(
+    () => fetch(url, { headers, signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) }),
+    isRetryable,
+    { retries, baseDelayMs, maxDelayMs, signal },
+  )
\`\`\`

> One caveat: \`AbortSignal.any\` needs Node 20.3+. The repo already pins Node 22 in \`.nvmrc\`, so that's fine.

Want me to add a metric for retry counts as well?`

const THINKING_TEXT = `The test failed because \`isRetryable\` treats a missing status as retryable, but the **abort** path also has no status. If the caller aborts, we must not retry.

Options:
- check \`err.name === 'AbortError'\` first
- or pass the signal into \`withRetry\` and bail when \`signal.aborted\`

The second one is cleaner and also stops the sleep early. I'll do that and add a test for it.`

const HANDBACK = `## Caching strategies in weather apps

Most apps cache **per city and per provider update cycle**, not per request:

- Forecast providers refresh every 10–60 minutes, so a TTL of ~10 min is typical.
- Stale-while-revalidate is the common pattern on the client.
- Several apps key the cache by *rounded* coordinates (2 decimals ≈ 1 km).

Recommendation: an in-memory LRU (500 entries, 10 min TTL) on the server, plus \`Cache-Control: max-age=300, stale-while-revalidate=600\` for clients.`

const COMPACT_SUMMARY = `This session is being continued from a previous conversation that ran out of context. Summary:

1. **Retry**: added \`withRetry\` with exponential backoff + jitter; \`fetchForecast\` uses it. Timeout configurable via \`FORECAST_TIMEOUT_MS\`.
2. **Caching research**: subagent recommended a 10-minute LRU on the server and SWR headers for clients. User chose *in-memory LRU*.
3. **Open items**: add retry metrics; write the cache layer.`

// ---- session ---------------------------------------------------------------------------------------

export function buildMockSession(): Session {
  const b = new Builder()
  const turns: Turn[] = []
  const subagents: SubagentRef[] = []

  // Turn 1 ─ human prompt with pasted blocks, an image, mentions and a system reminder.
  {
    const promptText =
      'Can you add a retry with exponential backoff to the forecast fetcher? It keeps failing on 503s (log + screenshot attached).\n\nAlso keep @src/api/forecast.ts readable — no clever one-liners.'
    const rawText = `${promptText}\n<pasted_content id="p1a2">${FORECAST_TS}</pasted_content id="p1a2">\n<pasted_content id="p3b4">${ERROR_LOG}</pasted_content id="p3b4">`
    const recordUuid = promptRecord(b, at(0), rawText)
    const t1 = 'turn-1'
    const rRead = result(b, at(0, 9), 'toolu_read_1', text(catN(FORECAST_TS)), {
      structured: {
        type: 'text',
        file: {
          filePath: `${CWD}/src/api/forecast.ts`,
          content: FORECAST_TS,
          numLines: lineCount(FORECAST_TS),
          startLine: 1,
          totalLines: lineCount(FORECAST_TS),
        },
      },
    })
    const rGrep = result(
      b,
      at(0, 10),
      'toolu_grep_1',
      text('Found 3 files\nsrc/api/forecast.ts\nsrc/pages/dashboard.ts\nsrc/api/__tests__/forecast.test.ts'),
      {
        structured: {
          mode: 'files_with_matches',
          numFiles: 3,
          filenames: ['src/api/forecast.ts', 'src/pages/dashboard.ts', 'src/api/__tests__/forecast.test.ts'],
        },
      },
    )
    const rGlob = result(
      b,
      at(0, 11),
      'toolu_glob_1',
      text('src/api/forecast.ts\nsrc/api/geocode.ts\nsrc/api/index.ts\nsrc/api/__tests__/forecast.test.ts'),
      {
        structured: {
          filenames: [
            'src/api/forecast.ts',
            'src/api/geocode.ts',
            'src/api/index.ts',
            'src/api/__tests__/forecast.test.ts',
          ],
          durationMs: 14,
          numFiles: 4,
          truncated: false,
        },
      },
    )
    const a1 = assistant(
      b,
      'msg_mock_a1',
      [
        { kind: 'thinking', id: 'blk-a1-think', text: '', durationMs: 4200 },
        {
          kind: 'text',
          id: 'blk-a1-text',
          markdown: "I'll start by reading the fetcher and finding everything that calls it.",
        },
        tool(
          'toolu_read_1',
          'Read',
          { file_path: `${CWD}/src/api/forecast.ts` },
          'src/api/forecast.ts',
          at(0, 8),
          { result: rRead, endedAt: at(0, 8, 140) },
        ),
        tool(
          'toolu_grep_1',
          'Grep',
          { pattern: 'fetchForecast', path: 'src', output_mode: 'files_with_matches', '-i': false },
          'fetchForecast in src',
          at(0, 9),
          { result: rGrep, endedAt: at(0, 9, 620) },
        ),
        tool('toolu_glob_1', 'Glob', { pattern: 'src/api/**/*.ts' }, 'src/api/**/*.ts', at(0, 10), {
          result: rGlob,
          endedAt: at(0, 10, 80),
        }),
      ],
      at(0, 3),
      at(0, 10),
      { usage: usage(4, 18_200, 6_400, 412), stopReason: 'tool_use' },
    )

    const oldString =
      '  const res = await fetch(url, {\n    headers: { authorization: `Bearer ${apiKey}` },\n    signal,\n  })'
    const newString =
      '  const res = await withRetry(\n    () => fetch(url, { headers: { authorization: `Bearer ${apiKey}` }, signal }),\n    isRetryable,\n    { retries, baseDelayMs, maxDelayMs, signal },\n  )'
    const rEdit = result(
      b,
      at(1, 2),
      'toolu_edit_1',
      text('The file src/api/forecast.ts has been updated.'),
      {
        structured: {
          filePath: `${CWD}/src/api/forecast.ts`,
          oldString,
          newString,
          structuredPatch: [
            {
              oldStart: 36,
              oldLines: 9,
              newStart: 36,
              newLines: 10,
              lines: [
                "   url.searchParams.set('days', '7')",
                ' ',
                '-  const res = await fetch(url, {',
                '-    headers: { authorization: `Bearer ${apiKey}` },',
                '-    signal,',
                '-  })',
                '+  const res = await withRetry(',
                '+    () => fetch(url, { headers: { authorization: `Bearer ${apiKey}` }, signal }),',
                '+    isRetryable,',
                '+    { retries, baseDelayMs, maxDelayMs, signal },',
                '+  )',
                ' ',
                '   if (!res.ok) {',
              ],
            },
          ],
          userModified: false,
          replaceAll: false,
        },
      },
    )
    const diag = attachment(
      b,
      at(1, 3),
      'att-diag-1',
      'diagnostics',
      'Diagnostics · 1 error',
      "src/api/forecast.ts:37:21 error TS2304: Cannot find name 'withRetry'. (typescript)",
      'toolu_edit_1',
    )
    const rTest = result(
      b,
      at(1, 20),
      'toolu_bash_1',
      text(
        ' RUN  v5.0.5 /home/dev/acme-weather\n\n ✓ src/api/__tests__/retry.test.ts (4 tests) 12ms\n ✓ src/api/__tests__/forecast.test.ts (6 tests) 31ms\n\n Test Files  2 passed (2)\n      Tests  10 passed (10)\n   Duration  612ms',
      ),
      {
        structured: {
          stdout:
            ' RUN  v5.0.5 /home/dev/acme-weather\n\n ✓ src/api/__tests__/retry.test.ts (4 tests) 12ms\n ✓ src/api/__tests__/forecast.test.ts (6 tests) 31ms\n\n Test Files  2 passed (2)\n      Tests  10 passed (10)\n   Duration  612ms',
          stderr: '',
          interrupted: false,
          isImage: false,
        },
      },
    )
    const a2 = assistant(
      b,
      'msg_mock_a2',
      [
        { kind: 'thinking', id: 'blk-a2-think', text: THINKING_TEXT, durationMs: 11_800 },
        tool(
          'toolu_edit_1',
          'Edit',
          { file_path: `${CWD}/src/api/forecast.ts`, old_string: oldString, new_string: newString },
          'src/api/forecast.ts',
          at(1, 1),
          {
            result: rEdit,
            endedAt: at(1, 2, 300),
            attachments: [diag],
          },
        ),
        tool(
          'toolu_bash_1',
          'Bash',
          { command: 'pnpm vitest run src/api', description: 'Run the API tests' },
          'Run the API tests',
          at(1, 4),
          { result: rTest, endedAt: at(1, 19, 400) },
        ),
      ],
      at(0, 40),
      at(1, 4),
      { usage: usage(3, 24_600, 1_900, 1_380), stopReason: 'tool_use' },
    )

    const { line: queuedLine } = b.record('attachment', at(1, 30), {
      attachment: {
        type: 'queued_command',
        prompt: 'also make sure the timeout is configurable via env',
        origin: { kind: 'human' },
      },
    })
    const queued: QueuedUserItem = {
      kind: 'queued-user',
      id: 'queued-1',
      text: 'also make sure the timeout is configurable via env',
      at: at(1, 30),
      recordLine: queuedLine,
    }

    const rTscFail = result(
      b,
      at(2, 9),
      'toolu_bash_2',
      text(
        "Exit code 2\nsrc/config.ts(14,5): error TS2322: Type 'string | undefined' is not assignable to type 'number'.\nsrc/config.ts(15,5): error TS2322: Type 'string | undefined' is not assignable to type 'number'.",
      ),
      {
        isError: true,
        structured: {
          stdout: '',
          stderr:
            "src/config.ts(14,5): error TS2322: Type 'string | undefined' is not assignable to type 'number'.\nsrc/config.ts(15,5): error TS2322: Type 'string | undefined' is not assignable to type 'number'.",
          interrupted: false,
          isImage: false,
        },
      },
    )
    const rWrite = result(
      b,
      at(2, 1),
      'toolu_write_1',
      text('File created successfully at: src/api/retry.ts'),
      {
        structured: {
          type: 'create',
          filePath: `${CWD}/src/api/retry.ts`,
          content: RETRY_TS,
          structuredPatch: [],
          originalFile: null,
          userModified: false,
        },
      },
    )
    const a3 = assistant(
      b,
      'msg_mock_a3',
      [
        tool(
          'toolu_write_1',
          'Write',
          { file_path: `${CWD}/src/api/retry.ts`, content: RETRY_TS },
          'src/api/retry.ts',
          at(2, 0),
          { result: rWrite, endedAt: at(2, 1, 50) },
        ),
        tool(
          'toolu_bash_2',
          'Bash',
          { command: 'pnpm tsc --noEmit -p .', description: 'Type-check the project' },
          'Type-check the project',
          at(2, 2),
          { result: rTscFail, endedAt: at(2, 9) },
        ),
      ],
      at(1, 45),
      at(2, 2),
      { usage: usage(2, 26_100, 800, 8, false), stopReason: null },
    )
    const hook = event(
      b,
      'evt-hook-1',
      'hook',
      'PostToolUse hook · prettier --write (0.4s)',
      'info',
      at(2, 10),
      'Ran: prettier --write src/api/retry.ts src/config.ts\nsrc/api/retry.ts 18ms\nsrc/config.ts 6ms',
    )
    const a4 = assistant(
      b,
      'msg_mock_a4',
      [{ kind: 'text', id: 'blk-a4-text', markdown: FINAL_MARKDOWN }],
      at(2, 30),
      at(3, 5),
      {
        usage: usage(5, 28_400, 2_100, 812),
        stopReason: 'end_turn',
      },
    )
    const dur = event(b, 'evt-dur-1', 'turn-duration', 'Turn took 3m 12s · 14 messages', 'info', at(3, 12))
    turns.push({
      id: t1,
      kind: 'human',
      startedAt: at(0),
      prompt: {
        segments: [
          { kind: 'text', text: promptText },
          { kind: 'pasted', id: 'p1a2', index: 1, lines: lineCount(FORECAST_TS), text: FORECAST_TS },
          { kind: 'pasted', id: 'p3b4', index: 2, lines: lineCount(ERROR_LOG), text: ERROR_LOG },
          { kind: 'image', mediaType: 'image/png', base64: MOCK_PNG_SUN },
          {
            kind: 'system-reminder',
            text: 'The user opened the file src/api/forecast.ts in the IDE. This may or may not be related to the current task.',
          },
        ],
        mentions: [
          { kind: 'file', path: 'src/api/forecast.ts', content: FORECAST_TS },
          { kind: 'directory', path: 'src/api/' },
        ],
        rawText,
        recordUuid,
      },
      items: [a1, a2, queued, a3, hook, a4, dur],
      durationMs: 192_000,
      hiddenContext: [
        hidden(
          b,
          'ctx-1-1',
          'total_tokens_reminder',
          '<system-reminder><total_tokens>742,118 tokens left</total_tokens></system-reminder>',
          at(0),
        ),
        hidden(
          b,
          'ctx-1-2',
          'skill_listing',
          '<system-reminder>The following skills are available: review, test-writer, release-notes</system-reminder>',
          at(0),
        ),
        hidden(
          b,
          'ctx-1-3',
          'environment',
          JSON.stringify(
            { workingDirectory: CWD, isGitRepo: true, platform: 'linux', shell: 'bash' },
            null,
            2,
          ),
          at(0),
        ),
      ],
    })
  }

  // Turn 2 ─ slash command with stdout.
  {
    const recordUuid = promptRecord(
      b,
      at(4),
      '<command-name>/model</command-name><command-args>claude-fable-5-1</command-args>',
    )
    const perm = event(b, 'evt-perm-1', 'permission', 'Permission mode: auto', 'notice', at(4, 2))
    turns.push({
      id: 'turn-2',
      kind: 'slash-command',
      startedAt: at(4),
      prompt: {
        segments: [],
        mentions: [],
        command: {
          name: 'model',
          args: 'claude-fable-5-1',
          stdout: 'Set model to claude-fable-5-1 (Fable 5.1)\nEffort: high',
        },
        rawText: '/model claude-fable-5-1',
        recordUuid,
      },
      items: [perm],
      hiddenContext: [],
    })
  }

  // Turn 3 ─ research: WebSearch, WebFetch, AskUserQuestion, TodoWrite, two Agents. Preceded by an abandoned branch.
  const abandoned: AbandonedBranch[] = []
  {
    const branchRecords: RawRecord[] = [
      {
        line: -1,
        type: 'user',
        uuid: 'mock-abandoned-1',
        parentUuid: 'mock-uuid-0040',
        timestamp: at(4, 30),
        message: { role: 'user', content: 'Research caching for weather apps.' },
      },
      {
        line: -1,
        type: 'assistant',
        uuid: 'mock-abandoned-2',
        parentUuid: 'mock-abandoned-1',
        timestamp: at(4, 33),
        message: {
          id: 'msg_mock_abandoned',
          model: 'claude-fable-5-1',
          content: [{ type: 'text', text: 'Sure — do you mean server-side or client-side caching?' }],
        },
      },
    ]
    abandoned.push({
      forkAfterUuid: 'mock-uuid-0040',
      anchorRowId: 'evt-perm-1',
      records: branchRecords,
      firstPromptPreview: 'Research caching for weather apps.',
    })

    const promptText =
      'Research how other weather apps cache forecasts. Ask me before choosing an approach, then plan the work.'
    const recordUuid = promptRecord(b, at(5), promptText)
    const rSearch = result(
      b,
      at(5, 20),
      'toolu_search_1',
      text('Web search results for "weather app forecast caching strategy"'),
      {
        structured: {
          query: 'weather app forecast caching strategy',
          results: [
            {
              tool_use_id: 'srvtoolu_mock_1',
              content: [
                {
                  title: 'Caching weather data: TTLs that match provider refresh cycles',
                  url: 'https://example.com/blog/weather-caching',
                },
                {
                  title: 'Stale-while-revalidate explained',
                  url: 'https://developer.example.org/docs/http/swr',
                },
                {
                  title: 'Designing a forecast API cache (case study)',
                  url: 'https://engineering.example.net/forecast-cache',
                },
              ],
            },
            'Most sources recommend matching the cache TTL to the provider refresh cycle (10–60 minutes) and serving stale data while revalidating.',
          ],
          durationSeconds: 1.9,
          searchCount: 1,
        },
      },
    )
    const rFetch = result(
      b,
      at(5, 40),
      'toolu_fetch_1',
      text('# Caching weather data\n\nProviders publish new model runs every 10 to 60 minutes…'),
      {
        structured: {
          bytes: 48_211,
          code: 200,
          codeText: 'OK',
          durationMs: 1_240,
          url: 'https://example.com/blog/weather-caching',
          result:
            '# Caching weather data\n\nProviders publish new model runs every **10 to 60 minutes**. Caching longer than that serves stale data; caching shorter wastes quota.\n\n- Key by rounded coordinates\n- Use `stale-while-revalidate`\n- Invalidate on provider `updatedAt` change',
        },
      },
    )
    const questions = [
      {
        question: 'Where should the forecast cache live?',
        header: 'Cache',
        multiSelect: false,
        options: [
          { label: 'In-memory LRU', description: 'Simple, per instance, lost on restart' },
          { label: 'Redis', description: 'Shared across instances, needs infra' },
          { label: 'HTTP cache only', description: 'Rely on Cache-Control headers' },
        ],
      },
      {
        question: 'Which TTL?',
        header: 'TTL',
        multiSelect: false,
        options: [{ label: '5 minutes' }, { label: '10 minutes' }, { label: '30 minutes' }],
      },
    ]
    const rAsk = result(
      b,
      at(6, 30),
      'toolu_ask_1',
      text(
        'User has answered your questions: "Where should the forecast cache live?"="In-memory LRU", "Which TTL?"="10 minutes".',
      ),
      {
        structured: {
          questions,
          answers: { 'Where should the forecast cache live?': 'In-memory LRU', 'Which TTL?': '10 minutes' },
          annotations: {},
        },
      },
    )
    const todos = [
      { content: 'Add an LRU cache module', status: 'in_progress', activeForm: 'Adding an LRU cache module' },
      {
        content: 'Wire the cache into fetchForecast',
        status: 'pending',
        activeForm: 'Wiring the cache into fetchForecast',
      },
      {
        content: 'Send Cache-Control headers from the API route',
        status: 'pending',
        activeForm: 'Sending Cache-Control headers',
      },
      {
        content: 'Research caching strategies',
        status: 'completed',
        activeForm: 'Researching caching strategies',
      },
    ]
    const rTodo = result(b, at(6, 40), 'toolu_todo_1', text('Todos have been modified successfully.'), {
      structured: { oldTodos: [], newTodos: todos },
    })
    const a5 = assistant(
      b,
      'msg_mock_a5',
      [
        { kind: 'thinking', id: 'blk-a5-think', text: '', durationMs: 2_300 },
        tool(
          'toolu_search_1',
          'WebSearch',
          { query: 'weather app forecast caching strategy' },
          'weather app forecast caching strategy',
          at(5, 18),
          { result: rSearch, endedAt: at(5, 19, 900) },
        ),
        tool(
          'toolu_fetch_1',
          'WebFetch',
          {
            url: 'https://example.com/blog/weather-caching',
            prompt: 'Summarize the recommended TTLs and invalidation rules.',
          },
          'example.com/blog/weather-caching',
          at(5, 38),
          { result: rFetch, endedAt: at(5, 39, 240) },
        ),
        tool('toolu_ask_1', 'AskUserQuestion', { questions }, '2 questions', at(5, 50), {
          result: rAsk,
          endedAt: at(6, 30),
        }),
        tool('toolu_todo_1', 'TodoWrite', { todos }, '4 todos', at(6, 39), {
          result: rTodo,
          endedAt: at(6, 39, 20),
        }),
      ],
      at(5, 10),
      at(6, 39),
      { model: 'claude-fable-5-1', usage: usage(7, 30_200, 3_300, 960), stopReason: 'tool_use' },
    )

    const launched: SubagentRef = {
      agentId: 'a91f',
      toolUseId: 'toolu_agent_1',
      description: 'Benchmark LRU libraries',
      agentType: 'general-purpose',
      model: 'claude-fable-5-1',
      status: 'launched',
    }
    const completed: SubagentRef = {
      agentId: 'b7c2',
      toolUseId: 'toolu_agent_2',
      description: 'Survey caching strategies',
      agentType: 'Explore',
      model: 'claude-opus-5-5',
      status: 'completed',
      handback: HANDBACK,
      fileKey: `${SESSION_ID}/subagents/agent-b7c2.jsonl`,
    }
    subagents.push(launched, completed)
    const rAgent1 = result(
      b,
      at(7, 2),
      'toolu_agent_1',
      text('Async agent launched successfully. agentId: a91f'),
      {
        structured: {
          isAsync: true,
          status: 'async_launched',
          agentId: 'a91f',
          description: 'Benchmark LRU libraries',
          resolvedModel: 'claude-fable-5-1',
          prompt: 'Compare lru-cache and quick-lru…',
          outputFile: '/tmp/agents/a91f.out',
        },
      },
    )
    const rAgent2 = result(b, at(9, 40), 'toolu_agent_2', text(HANDBACK), {
      structured: {
        status: 'completed',
        agentId: 'b7c2',
        content: [{ type: 'text', text: HANDBACK }],
        totalDurationMs: 154_000,
        totalTokens: 41_200,
        totalToolUseCount: 12,
      },
    })
    const a6 = assistant(
      b,
      'msg_mock_a6',
      [
        {
          kind: 'text',
          id: 'blk-a6-text',
          markdown:
            "Going with an **in-memory LRU** and a 10-minute TTL. I'll have two agents dig into the details in parallel.",
        },
        tool(
          'toolu_agent_1',
          'Agent',
          {
            description: 'Benchmark LRU libraries',
            subagent_type: 'general-purpose',
            run_in_background: true,
            prompt:
              'Compare `lru-cache` and `quick-lru` for:\n\n- memory per entry\n- TTL support\n- ESM-only packaging\n\nReturn a short table.',
          },
          'Benchmark LRU libraries',
          at(7, 0),
          { result: rAgent1, endedAt: at(7, 2), subagent: launched },
        ),
        tool(
          'toolu_agent_2',
          'Agent',
          {
            description: 'Survey caching strategies',
            subagent_type: 'Explore',
            prompt: 'Survey how popular weather apps cache forecasts. Summarize in under 200 words.',
          },
          'Survey caching strategies',
          at(7, 6),
          { result: rAgent2, endedAt: at(9, 40), subagent: completed },
        ),
      ],
      at(6, 50),
      at(7, 6),
      { model: 'claude-fable-5-1', usage: usage(4, 33_900, 1_100, 640), stopReason: 'tool_use' },
    )
    const recap = event(
      b,
      'evt-recap-1',
      'recap',
      'While you were away: two agents researched caching; one is still running',
      'notice',
      at(10, 0),
      'Recap: the Explore agent finished its survey (10-minute LRU recommended). The benchmark agent is still running in the background. (disable recaps in /config)',
    )
    const date = event(b, 'evt-date-1', 'date-change', 'Date changed to 2026-10-25', 'info', at(10, 1))
    turns.push({
      id: 'turn-3',
      kind: 'human',
      startedAt: at(5),
      prompt: {
        segments: [{ kind: 'text', text: promptText }],
        mentions: [],
        rawText: promptText,
        recordUuid,
      },
      items: [a5, a6, recap, date],
      hiddenContext: [
        hidden(
          b,
          'ctx-3-1',
          'date_change',
          '<system-reminder>The date has changed. Today is 2026-10-25.</system-reminder>',
          at(10, 1),
        ),
      ],
    })
  }

  // Turn 4 ─ task notification.
  {
    const raw =
      '<task-notification><task-id>b7c2</task-id><status>completed</status><summary>Agent "Survey caching strategies" completed</summary><result>Recommendation: in-memory LRU (500 entries, 10 min TTL) plus `stale-while-revalidate` headers for clients.</result></task-notification>'
    const recordUuid = promptRecord(b, at(10, 5), raw, { isMeta: true })
    const a7 = assistant(
      b,
      'msg_mock_a7',
      [
        {
          kind: 'text',
          id: 'blk-a7-text',
          markdown: 'The survey agent is done and agrees with the plan. Starting on the cache module.',
        },
      ],
      at(10, 8),
      at(10, 9),
      {
        model: 'claude-fable-5-1',
        usage: usage(3, 35_100, 400, 38),
        stopReason: 'end_turn',
      },
    )
    turns.push({
      id: 'turn-4',
      kind: 'task-notification',
      startedAt: at(10, 5),
      prompt: {
        segments: [{ kind: 'text', text: 'Agent "Survey caching strategies" completed' }],
        mentions: [],
        rawText: raw,
        recordUuid,
        notification: {
          taskId: 'b7c2',
          toolUseId: 'toolu_agent_2',
          status: 'completed',
          summary: 'Agent "Survey caching strategies" completed',
        },
      },
      items: [a7],
      hiddenContext: [],
    })
  }

  // Turn 5 ─ odds and ends: image Read, unknown MCP tool, denied, pending, persisted output, fallback, unknown block,
  // API error group, compaction; interrupted without an explicit interrupt event.
  {
    const promptText =
      'Check the chart screenshot in docs/, file a Linear issue for the retry metric, and clean up the build folder.'
    const recordUuid = promptRecord(b, at(12), promptText)
    const rImg = result(
      b,
      at(12, 9),
      'toolu_read_img',
      [{ type: 'image', mediaType: 'image/png', base64: MOCK_PNG_CHART }],
      {
        structured: {
          type: 'image',
          file: {
            base64: MOCK_PNG_CHART,
            type: 'image/png',
            originalSize: 120,
            dimensions: { originalWidth: 36, originalHeight: 32, displayWidth: 36, displayHeight: 32 },
          },
        },
      },
    )
    const rMcp = result(
      b,
      at(12, 20),
      'toolu_mcp_1',
      text(
        '{"id":"WTH-142","url":"https://linear.example.com/acme/issue/WTH-142","title":"Track forecast retry counts"}',
      ),
    )
    const rDenied = result(
      b,
      at(12, 30),
      'toolu_bash_rm',
      text("The user doesn't want to proceed with this tool use. The tool use was rejected."),
      {
        isError: true,
        denied: 'The user rejected this command: rm -rf dist build .cache',
      },
    )
    const bigLog = Array.from(
      { length: 120 },
      (_, i) =>
        `[build] step ${String(i + 1).padStart(3, '0')}/120 ${i % 17 === 0 ? 'compiling chunk vendor~' + i : 'ok'}`,
    ).join('\n')
    const rBig = result(
      b,
      at(12, 50),
      'toolu_bash_big',
      text(`<persisted-output>\nOutput too large (212 KB). Preview:\n${bigLog}\n</persisted-output>`),
      {
        structured: {
          stdout: bigLog,
          stderr: '',
          interrupted: false,
          isImage: false,
          persistedOutputPath: '/home/dev/.claude/tool-results/mock-build.txt',
          persistedOutputSize: 212_004,
        },
        persistedPath: '/home/dev/.claude/tool-results/mock-build.txt',
      },
    )
    const a8 = assistant(
      b,
      'msg_mock_a8',
      [
        { kind: 'fallback', id: 'blk-a8-fallback', from: 'claude-opus-5-5', to: 'claude-fable-5-1' },
        tool(
          'toolu_read_img',
          'Read',
          { file_path: `${CWD}/docs/retry-chart.png` },
          'docs/retry-chart.png',
          at(12, 8),
          { result: rImg, endedAt: at(12, 8, 90) },
        ),
        tool(
          'toolu_mcp_1',
          'mcp__linear__create_issue',
          {
            team: 'WTH',
            title: 'Track forecast retry counts',
            description: 'Emit a counter per retry attempt, tagged by status code.',
            priority: 3,
          },
          '{"team":"WTH","title":"Track forecast retry counts","descr…',
          at(12, 18),
          { result: rMcp, endedAt: at(12, 19, 700) },
        ),
        tool(
          'toolu_bash_rm',
          'Bash',
          { command: 'rm -rf dist build .cache', description: 'Remove build artifacts' },
          'Remove build artifacts',
          at(12, 25),
          { result: rDenied, endedAt: at(12, 30) },
        ),
        tool(
          'toolu_bash_big',
          'Bash',
          { command: 'pnpm build --verbose', description: 'Build with verbose logging' },
          'Build with verbose logging',
          at(12, 32),
          { result: rBig, endedAt: at(12, 50) },
        ),
        {
          kind: 'unknown',
          id: 'blk-a8-unknown',
          raw: {
            type: 'server_tool_use',
            id: 'srvtoolu_mock_9',
            name: 'code_execution',
            input: { code: 'print(2 + 2)' },
          },
        },
        tool(
          'toolu_bash_watch',
          'Bash',
          {
            command: 'pnpm vitest --watch',
            description: 'Start tests in watch mode',
            run_in_background: false,
          },
          'Start tests in watch mode',
          at(12, 55),
        ),
      ],
      at(12, 5),
      at(12, 55),
      {
        model: 'claude-fable-5-1',
        requestedModel: 'claude-opus-5-5',
        cacheMiss: 'model_changed',
        usage: usage(6, 38_400, 2_900, 1_120),
        stopReason: 'tool_use',
      },
    )
    const apiErr = assistant(b, 'msg_mock_err', [], at(13, 10), at(13, 10), {
      model: '<synthetic>',
      effort: undefined,
      usage: usage(0, 0, 0, 0),
      stopReason: 'stop_sequence',
      error: { status: 529, text: 'Overloaded. Retrying in 4s (attempt 2 of 10).' },
    })
    const errEvt = event(
      b,
      'evt-apierr-1',
      'api-error',
      'API error 529 · Overloaded',
      'error',
      at(13, 10),
      'Request req_mock_err failed with 529 Overloaded. Claude Code retried automatically.',
    )
    const diagEvt = event(
      b,
      'evt-diag-1',
      'diagnostics',
      'New diagnostics in 2 files',
      'warning',
      at(13, 20),
      "src/api/retry.ts:12:7 warning 'attempt' is reassigned (eslint prefer-const)\nsrc/config.ts:3:1 info Unused import 'z'",
    )
    const taskEvt = event(
      b,
      'evt-task-1',
      'task-status',
      'Background agent “Benchmark LRU libraries” is still running',
      'info',
      at(13, 30),
    )
    const infoEvt = event(
      b,
      'evt-info-1',
      'informational',
      'Compacted while idle, before the prompt cache expired',
      'notice',
      at(14, 0),
    )
    const fbEvt = event(
      b,
      'evt-fallback-1',
      'model-fallback',
      'Model fell back to claude-fable-5-1 (overloaded)',
      'warning',
      at(12, 6),
    )
    const localEvt = event(
      b,
      'evt-local-1',
      'local-command',
      '/cost',
      'info',
      at(13, 40),
      'Total cost: $1.84\nTotal duration (API): 6m 12s',
    )
    const otherEvt = event(
      b,
      'evt-other-1',
      'other',
      'stop_hook_summary · 1 hook, prevented continuation',
      'warning',
      at(13, 50),
      'Stop hook "check-todos" exited 2: 2 todos still open',
    )
    const { line: compactLine } = b.record('system', at(14, 5), {
      subtype: 'compact_boundary',
      content: 'Conversation compacted',
      compactMetadata: { trigger: 'auto', preTokens: 167_412 },
    })
    const compaction: CompactionItem = {
      kind: 'compaction',
      id: 'compact-1',
      at: at(14, 5),
      summaryMarkdown: COMPACT_SUMMARY,
      preTokens: 167_412,
      trigger: 'auto',
      recordLines: [compactLine],
    }
    turns.push({
      id: 'turn-5',
      kind: 'human',
      startedAt: at(12),
      prompt: {
        segments: [{ kind: 'text', text: promptText }],
        mentions: [{ kind: 'directory', path: 'docs/' }],
        rawText: promptText,
        recordUuid,
      },
      items: [fbEvt, a8, apiErr, errEvt, diagEvt, taskEvt, localEvt, otherEvt, infoEvt, compaction],
      interrupted: 'tool-use',
      hiddenContext: [],
    })
  }

  // Turn 6 ─ compact summary.
  {
    const recordUuid = promptRecord(b, at(14, 6), COMPACT_SUMMARY, { isCompactSummary: true })
    const a9 = assistant(
      b,
      'msg_mock_a9',
      [
        {
          kind: 'text',
          id: 'blk-a9-text',
          markdown: 'Picking up where we left off: the cache layer is next.',
        },
      ],
      at(14, 10),
      at(14, 11),
      {
        usage: usage(12_400, 0, 9_800, 24),
        stopReason: 'end_turn',
      },
    )
    turns.push({
      id: 'turn-6',
      kind: 'compact-summary',
      startedAt: at(14, 6),
      prompt: {
        segments: [{ kind: 'text', text: COMPACT_SUMMARY }],
        mentions: [],
        rawText: COMPACT_SUMMARY,
        recordUuid,
      },
      items: [a9],
      hiddenContext: [],
    })
  }

  // Turn 7 ─ agent message.
  {
    const msg =
      'From **benchmark-agent**: `quick-lru` uses ~40% less memory per entry but has no per-entry TTL. `lru-cache` v11 supports `ttl` natively. Suggest `lru-cache`.'
    const recordUuid = promptRecord(b, at(15), msg)
    const a10 = assistant(
      b,
      'msg_mock_a10',
      [{ kind: 'text', id: 'blk-a10-text', markdown: 'Thanks — `lru-cache` it is.' }],
      at(15, 3),
      at(15, 4),
      {
        usage: usage(3, 14_000, 200, 12),
        stopReason: 'end_turn',
      },
    )
    turns.push({
      id: 'turn-7',
      kind: 'agent-message',
      startedAt: at(15),
      prompt: {
        segments: [{ kind: 'text', text: msg }],
        mentions: [],
        rawText: msg,
        recordUuid,
        agentMessage: {
          from: 'benchmark-agent',
          body: msg.replace('From **benchmark-agent**: ', ''),
          handback: false,
        },
      },
      items: [a10],
      hiddenContext: [],
    })
  }

  // Turn 8 ─ meta record, then a user interrupt.
  {
    const meta =
      'Base directory for this skill: /home/dev/.claude/skills/test-writer\n\n# Test writer\nWrite focused vitest tests. Prefer table-driven cases.'
    const recordUuid = promptRecord(b, at(16), meta, { isMeta: true })
    const a11 = assistant(
      b,
      'msg_mock_a11',
      [
        {
          kind: 'text',
          id: 'blk-a11-text',
          markdown: 'Writing tests for the cache module now. First, the eviction ca',
        },
      ],
      at(16, 4),
      at(16, 6),
      {
        usage: usage(3, 14_400, 300, 8, false),
        aborted: true,
      },
    )
    const intr = event(b, 'evt-interrupt-1', 'interrupt', 'Interrupted by user', 'warning', at(16, 7))
    turns.push({
      id: 'turn-8',
      kind: 'meta',
      startedAt: at(16),
      prompt: { segments: [{ kind: 'text', text: meta }], mentions: [], rawText: meta, recordUuid },
      items: [a11, intr],
      interrupted: 'user',
      hiddenContext: [],
    })
  }

  const session: Session = {
    summary: {
      sessionId: SESSION_ID,
      title: 'Forecast fetcher: retry with backoff + caching plan',
      titleSource: 'ai-title',
      cwd: CWD,
      projectName: 'acme-weather',
      gitBranch: 'feat/forecast-retry',
      startedAt: at(0),
      endedAt: at(16, 7),
      durationMs: 16 * 60_000 + 7_000,
      turnCount: turns.length,
      assistantMessageCount: 11,
      toolCallCount: 19,
      subagentCount: 2,
      subagentFilesPresent: 1,
      models: ['claude-opus-5-5', 'claude-fable-5-1'],
      versions: ['2.1.295'],
      entrypoint: 'cli',
      permissionMode: 'auto',
      tokens: usage(12_460, 340_800, 33_200, 6_532, false),
      costUsd: 1.84,
      costSource: 'estimate',
    },
    turns,
    abandoned,
    subagents,
    raw: b.raw,
    searchIndex: [],
  }
  session.searchIndex = buildMockSearchIndex(session)
  return session
}

/** A simple search index over the mock (the real one is built by the worker). */
/** The mock's index is the real one, so UI tests see exactly what the worker would report. */
export function buildMockSearchIndex(session: Session): SearchEntry[] {
  return buildSearchIndex(session.turns)
}

// ---- long session for virtualization perf -----------------------------------------------------------

const LOREM = [
  'Looked at the cache hit ratio over the last hour; it hovers around **82%**.',
  'The eviction policy is fine, but the TTL is shorter than the provider refresh cycle.',
  'Here is the relevant snippet:\n\n```ts\nconst cache = new LRUCache<string, Forecast>({ max: 500, ttl: 600_000 })\n```',
  '- geocode lookups are cached separately\n- forecasts are keyed by rounded coordinates\n- alerts bypass the cache',
  'All checks pass. Next, I will update the README with the new environment variables.',
]

/** About `rows` rows (prompt + assistant + tool + event per turn) of synthetic content. */
export function buildLongMockSession(rows = 3000): Session {
  const b = new Builder()
  const turns: Turn[] = []
  let count = 0
  for (let i = 0; count < rows; i++) {
    const min = i
    const promptText = `Step ${i + 1}: ${['check the cache stats', 'tune the TTL', 'review the eviction logs', 'update the docs', 'run the full test suite'][i % 5]}`
    const recordUuid = promptRecord(b, at(min % 60), promptText)
    const r = result(b, at(min % 60, 5), `toolu_long_${i}`, text(`ok ${i}\n${'line\n'.repeat(i % 7)}`), {
      structured: { stdout: `ok ${i}\n${'line\n'.repeat(i % 7)}`, stderr: '', interrupted: false },
    })
    const a = assistant(
      b,
      `msg_long_${i}`,
      [
        { kind: 'text', id: `blk-long-${i}-t`, markdown: LOREM[i % LOREM.length] },
        tool(
          `toolu_long_${i}`,
          'Bash',
          { command: `pnpm run step-${i}`, description: `Run step ${i + 1}` },
          `Run step ${i + 1}`,
          at(min % 60, 2),
          { result: r, endedAt: at(min % 60, 4) },
        ),
      ],
      at(min % 60, 1),
      at(min % 60, 2),
      { usage: usage(3, 10_000 + i * 10, 200, 120), stopReason: 'end_turn' },
    )
    const items: Turn['items'] = [
      a,
      event(b, `evt-long-${i}`, 'turn-duration', `Turn took ${(i % 50) + 3}s`, 'info', at(min % 60, 9)),
    ]
    if (i % 3 === 0) {
      items.splice(
        1,
        0,
        assistant(
          b,
          `msg_long_${i}_b`,
          [{ kind: 'text', id: `blk-long-${i}-u`, markdown: LOREM[(i + 2) % LOREM.length] }],
          at(min % 60, 6),
          at(min % 60, 7),
          { usage: usage(2, 10_100, 0, 64), stopReason: 'end_turn' },
        ),
      )
    }
    turns.push({
      id: `long-turn-${i}`,
      kind: 'human',
      startedAt: at(min % 60),
      prompt: {
        segments: [{ kind: 'text', text: promptText }],
        mentions: [],
        rawText: promptText,
        recordUuid,
      },
      items,
      hiddenContext: [],
    })
    count += 1 + items.length
  }
  const session: Session = {
    summary: {
      sessionId: 'mock-long-session',
      title: `Long mock session (${count} rows)`,
      titleSource: 'session-id',
      cwd: CWD,
      projectName: 'acme-weather',
      startedAt: at(0),
      endedAt: at(59),
      durationMs: 59 * 60_000,
      turnCount: turns.length,
      assistantMessageCount: turns.length,
      toolCallCount: turns.length,
      subagentCount: 0,
      subagentFilesPresent: 0,
      models: ['claude-opus-5-5'],
      versions: ['2.1.295'],
      tokens: usage(0, 0, 0, 0),
    },
    turns,
    abandoned: [],
    subagents: [],
    raw: b.raw,
    searchIndex: [],
  }
  session.searchIndex = buildMockSearchIndex(session)
  return session
}
