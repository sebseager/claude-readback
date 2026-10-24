# claude-readback

Read [Claude Code](https://docs.anthropic.com/en/docs/claude-code) session transcripts like a conversation.
Drop a session's `.jsonl` (and its subagents) into the page to see prompts, answers, tool calls with their
results, subagents and usage stats, all searchable.

**Runs entirely in your browser. Nothing is uploaded.** Files are parsed in a Web Worker and kept in
IndexedDB so the library survives reloads. No network requests, analytics or telemetry. Delete a session, or
clear everything in Settings, and it is gone.

## Where transcripts live

```
~/.claude/projects/<escaped cwd>/<sessionId>.jsonl                   main transcript
~/.claude/projects/<escaped cwd>/<sessionId>/subagents/agent-*.jsonl  subagent transcripts
```

`<escaped cwd>` is the project directory with `/` and other non-alphanumeric characters replaced by `-`.

## Using it

- **Add sessions**: click **Upload** or drop files anywhere. Drop a whole project or session folder
  (Chromium) and subagent transcripts attach to their parent automatically.
- **Browse**: the sidebar groups stored sessions by day. Each row can be exported (`.jsonl`, or a `.zip` with
  subagents) or deleted.
- **Search**: <kbd>⌘F</kbd> / <kbd>Ctrl+F</kbd> focuses search; <kbd>Enter</kbd> / <kbd>Shift+Enter</kbd> step
  through hits; <kbd>Esc</kbd> clears.
- **Settings** (gear): theme, chat font, show hidden context by default, clear all data.
- **Stats**: the header toggle opens turns, tool calls, tokens, estimated cost, models, context growth and
  time between turns, optionally including loaded subagents.

## What it shows

Prompts with pastes, images, `@`-files and system reminders as chips; markdown responses with copyable code and
thinking durations; tool calls as cards with per-tool views (terminal output, diffs, files, search results,
questions, todos) plus errors, denials and hook output; subagent transcripts nested inline; queued messages,
slash commands, compaction summaries, interrupts, API errors and other system events; hidden context behind a
per-turn toggle; rewound branches as a stub at the fork; raw JSON for any row.

## Development

Requires Node 22+ and pnpm. Stack: Vite, React 19, TypeScript, Tailwind v4, shadcn/ui, zustand, comlink, idb,
recharts.

```sh
pnpm install
pnpm dev          # dev server (open /#mock for a demo session)
pnpm build        # type-check and build to dist/
pnpm test         # vitest
pnpm typecheck
pnpm lint
```

Parsing and folding run in `src/workers/`; `src/lib/transcript/types.ts` is the contract between parser and UI.
Fixtures in `fixtures/` are synthetic. Never commit real transcripts.
`CC_REAL_TRANSCRIPTS=1 pnpm vitest run src/lib/transcript/real-transcripts.test.ts` folds everything under
`~/.claude/projects` locally and prints counts only.

## Known limitations

- Recent Claude Code versions store thinking without its text, so most blocks show only "Thought for Ns".
- Output tokens are lower bounds (shown with `≥`) when a response's final usage record is missing.
- Cost is estimated from list prices unless the session carries a `cost-state` record.
- Folder drop uses a non-standard directory API and is tested in Chromium; elsewhere, pick files.
