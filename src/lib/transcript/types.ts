// Contract between the transcript parser and the UI.
// The scaffold task copies this file to src/lib/transcript/types.ts. Extend it; do not fork it.
// See docs/superpowers/research/jsonl-format.md §12 for the rationale behind each field.

/** One parsed JSONL line. `line` is the 0-based line index in its file. */
export interface RawRecord {
  line: number
  type: string
  uuid?: string
  parentUuid?: string | null
  timestamp?: string
  /** Any other field, untouched. */
  [key: string]: unknown
}

export interface Usage {
  inputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  outputTokens: number
  /** False when no record of the group carried a stop_reason: outputTokens is then a lower bound. */
  final: boolean
}

export interface SessionSummary {
  sessionId: string
  title: string
  /**
   * Where the title came from, for the tooltip. `command`: the first slash command (sessions with no typed
   * prompt); `last-prompt`: the `last-prompt` record.
   */
  titleSource: 'ai-title' | 'agent-name' | 'first-prompt' | 'command' | 'last-prompt' | 'session-id'
  cwd: string
  projectName: string
  gitBranch?: string
  startedAt: string // ISO
  endedAt: string // ISO
  durationMs: number
  turnCount: number
  assistantMessageCount: number
  toolCallCount: number
  subagentCount: number
  subagentFilesPresent: number
  models: string[]
  versions: string[]
  entrypoint?: string
  permissionMode?: string
  tokens: Usage
  costUsd?: number
  costSource?: 'cost-state' | 'estimate'
  continuedInSessionId?: string
  /** Set on subagent sessions. */
  parent?: { sessionId: string; toolUseId?: string; agentId: string }
  /** Set at ingest when another stored session's `continued-in` points here. */
  continuedFromSessionId?: string
  /** Sum of `system/turn_duration` values (time Claude was actually working). */
  activeMs?: number
  /** Sum of `thinkingDurationMs` over thinking blocks. */
  thinkingMs?: number
  /** Number of records in the file, and how many uuid records ended up on the active branch. */
  recordCount?: number
  abandonedRecordCount?: number
  /** `last-prompt.lastPrompt` (≤ ~200 chars), handy as a list subtitle. */
  lastPrompt?: string
}

export interface Session {
  summary: SessionSummary
  turns: Turn[]
  /** Rewound / edited branches, shown collapsed at their fork point. */
  abandoned: AbandonedBranch[]
  /** Subagents discovered via Agent tool calls and/or uploaded files. */
  subagents: SubagentRef[]
  raw: RawRecord[]
  /** Flat search index: one entry per searchable text, pointing at a row/block. */
  searchIndex: SearchEntry[]
}

export interface AbandonedBranch {
  /** uuid of the active record after which this branch forks off. */
  forkAfterUuid: string
  /** Row id where the stub should render. */
  anchorRowId: string
  records: RawRecord[]
  firstPromptPreview?: string
  /** The same branch folded like the active one (so the UI can render the earlier version). */
  turns?: Turn[]
  /** Turn id of the active sibling that replaced this branch (the re-sent / edited prompt), if any. */
  replacedByTurnId?: string
}

export type TurnKind =
  | 'human'
  | 'slash-command'
  | 'task-notification'
  | 'agent-message'
  | 'compact-summary'
  | 'meta'

export interface Turn {
  id: string // promptId when present, else uuid of the opening record
  kind: TurnKind
  startedAt: string
  prompt?: UserPrompt
  /** Chronological rows: everything that happened between this prompt and the next. */
  items: TurnItem[]
  durationMs?: number
  interrupted?: 'user' | 'tool-use' | 'shutdown'
  /** Attachment / meta records hidden behind the "N context items" toggle. */
  hiddenContext: HiddenContextItem[]
  /** Every record line that opened/defined this turn (prompt, command + stdout, caveat…), for raw view. */
  recordLines?: number[]
  /** Linked subagent for task-notification / agent-message turns and `/btw` fork commands. */
  subagent?: SubagentRef
  /** `file-history-snapshot` written for this prompt ("checkpoint · N files tracked"). */
  checkpoint?: { fileCount: number; recordLine: number }
}

export interface UserPrompt {
  segments: PromptSegment[]
  mentions: Mention[]
  /** Slash command details when kind === 'slash-command'. */
  command?: { name: string; args?: string; message?: string; stdout?: string }
  /** The raw text as stored (with tags), for search and raw view. */
  rawText: string
  recordUuid: string
  /** Delivered from the input queue (typed while Claude was busy; `promptSource: "queued"`). */
  queued?: boolean
  /** Parsed `<task-notification>` fields (kind === 'task-notification'). */
  notification?: { taskId?: string; toolUseId?: string; status?: string; summary?: string; outputFile?: string }
  /** Parsed `<agent-message from="…">` (kind === 'agent-message'). */
  agentMessage?: { from: string; body: string; handback: boolean }
}

export type PromptSegment =
  | { kind: 'text'; text: string }
  | { kind: 'pasted'; id: string; index: number; lines: number; text: string }
  | { kind: 'image'; mediaType: string; base64: string }
  | { kind: 'document'; mediaType: string; base64?: string; name?: string }
  | { kind: 'system-reminder'; text: string }

export interface Mention {
  kind: 'file' | 'directory' | 'pdf' | 'other'
  path: string
  /** Content Claude Code attached (if any) for the inspector. */
  content?: string
  recordLine?: number
}

export interface HiddenContextItem {
  id: string
  label: string
  recordLine: number
  /** Text the model actually saw (attachment.rendered[].content) or a JSON dump. */
  text: string
}

export type TurnItem =
  | AssistantItem
  | QueuedUserItem
  | EventItem
  | CompactionItem

export interface AssistantItem {
  kind: 'assistant'
  id: string // message.id
  requestId?: string
  model: string
  requestedModel?: string
  effort?: string
  blocks: Block[]
  usage: Usage
  stopReason?: string | null
  error?: { status?: number; text: string }
  aborted?: boolean
  startedAt: string
  endedAt: string
  /** Lines of all records in this group (for raw view). */
  recordLines: number[]
  /** `message.diagnostics.cache_miss_reason.type` when the prompt cache missed. */
  cacheMiss?: string
  /** `attributionAgent` (subagent type) when present. */
  agent?: string
}

export interface QueuedUserItem {
  kind: 'queued-user'
  id: string
  text: string
  at: string
  recordLine: number
  /** Parsed like a prompt (pasted blocks are numbered in the same per-session sequence). */
  segments?: PromptSegment[]
}

export type EventLevel = 'info' | 'notice' | 'warning' | 'error'

export interface EventItem {
  kind: 'event'
  id: string
  /** Stable category for icons/styling. */
  category:
    | 'turn-duration'
    | 'hook'
    | 'interrupt'
    | 'api-error'
    | 'model-fallback'
    | 'recap'
    | 'date-change'
    | 'diagnostics'
    | 'task-status'
    | 'local-command'
    | 'permission'
    | 'informational'
    | 'other'
  label: string
  detail?: string
  level: EventLevel
  at?: string
  recordLines: number[]
}

export interface CompactionItem {
  kind: 'compaction'
  id: string
  at: string
  summaryMarkdown?: string
  preTokens?: number
  trigger?: string
  recordLines: number[]
}

export type Block =
  | TextBlock
  | ThinkingBlock
  | ToolBlock
  | FallbackBlock
  | UnknownBlock

export interface TextBlock {
  kind: 'text'
  id: string
  markdown: string
}

export interface ThinkingBlock {
  kind: 'thinking'
  id: string
  text: string // often ""
  redacted?: boolean
  durationMs?: number
}

export interface ToolBlock {
  kind: 'tool'
  id: string // tool_use id
  name: string
  input: unknown
  /** One-line human summary computed by lib/transcript/tools.ts. */
  summary: string
  result?: ToolResult
  /** Attachment records linked by toolUseID: diagnostics, truncation notices, hook output… */
  attachments: ToolAttachment[]
  subagent?: SubagentRef
  startedAt: string
  /** Timestamp of the tool_result record, when present. */
  endedAt?: string
  /** 0-based line of the assistant record carrying the tool_use block. */
  recordLine?: number
}

export interface ToolResult {
  content: ToolResultContent[]
  isError: boolean
  /** The structured `toolUseResult` field, verbatim. */
  structured?: unknown
  denied?: string
  persistedPath?: string
  recordLine: number
}

export type ToolResultContent =
  | { type: 'text'; text: string }
  | { type: 'image'; mediaType: string; base64: string }
  | { type: 'document'; mediaType: string; base64?: string }
  | { type: 'unknown'; raw: unknown }

export interface ToolAttachment {
  id: string
  type: string
  label: string
  text: string
  recordLine: number
}

export interface FallbackBlock {
  kind: 'fallback'
  id: string
  from: string
  to: string
}

export interface UnknownBlock {
  kind: 'unknown'
  id: string
  raw: unknown
}

export interface SubagentRef {
  agentId: string
  /** Agent tool_use id in the parent, when known. */
  toolUseId?: string
  description?: string
  agentType?: string
  model?: string
  status: 'launched' | 'completed' | 'unknown'
  handback?: string
  /** Storage key of the subagent transcript if it was uploaded. */
  fileKey?: string
  meta?: Record<string, unknown>
  parentAgentId?: string
}

export interface SearchEntry {
  /** Row id (turn id, item id or block id) to scroll to / expand. */
  rowId: string
  /** Where inside the row, for expanding the right card. */
  blockId?: string
  field: 'prompt' | 'pasted' | 'assistant' | 'thinking' | 'tool-input' | 'tool-result' | 'event' | 'context'
  text: string
}

/** Stored file (IndexedDB). */
export interface StoredFile {
  key: string
  sessionId: string
  role: 'main' | 'subagent' | 'meta' | 'workflow'
  name: string
  size: number
  addedAt: string
  text: string
  /** Subagent / meta files: the `<agentId>` from `agent-<agentId>.jsonl`. */
  agentId?: string
}

// ---------------------------------------------------------------------------------------------
// Additions (data layer). Everything below is new; nothing above was renamed or removed.

/** A subagent transcript that is available (uploaded) for linking while folding its parent. */
export interface SubagentFileInfo {
  agentId: string
  fileKey: string
  /** Parsed `agent-<id>.meta.json`, if uploaded. */
  meta?: Record<string, unknown>
  /** From the first `fork-context-ref` record of a fork transcript. */
  forkParentLastUuid?: string
}

/** One search hit. `start`/`end` are offsets into `SearchEntry.text`. */
export interface SearchMatch {
  entryIndex: number
  rowId: string
  blockId?: string
  field: SearchEntry['field']
  start: number
  end: number
  /** ~40 chars of context either side, newlines collapsed to spaces. */
  snippet: { before: string; match: string; after: string }
  /** Set when the hit is inside a loaded subagent transcript rather than the main session. */
  fileKey?: string
}

/** Row in the `sessions` IndexedDB store. */
export interface StoredSession {
  sessionId: string
  summary: SessionSummary
  updatedAt: string
}
