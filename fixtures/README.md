# Fixtures

All content here is synthetic. No real prompts, code, paths or identifiers are included.

## Layout (mirrors `~/.claude/projects/<escaped-cwd>/`)

```
fixtures/
  synthetic-session.jsonl                      # main transcript (121 lines)
  synthetic-session/                           # sibling dir named after the jsonl basename (= sessionId in real data)
    subagents/
      agent-a5e55a0de00000001.jsonl            # background Agent subagent (8 lines, isSidechain: true)
      agent-a5e55a0de00000001.meta.json        # { agentType, description, toolUseId -> Agent tool_use id in main file, ... }
      agent-awhat-is-wc-5e55a0de00000001.jsonl # /btw fork transcript, starts with a fork-context-ref record (6 lines)
      agent-awhat-is-wc-5e55a0de00000001.meta.json
  generate_synthetic.py                        # the script that wrote all of the above (python3 generate_synthetic.py fixtures/)
  edge-cases.jsonl                             # fold edge cases (38 lines, partial last line on purpose)
  generate_edge_cases.py                       # writes edge-cases.jsonl (python3 generate_edge_cases.py fixtures/)
```

`edge-cases.jsonl` covers: blank / invalid / partial last lines, two pastes in one prompt (one closed with a plain
`</pasted_content>`), an inline system-reminder, a three-way parallel tool call with out-of-order results, the
linear 2.1.235 shape, `redacted_thinking` and unknown blocks, an orphan tool_result, the `sourceToolAssistantUUID`
fallback, unknown record types / system subtypes / attachment types, a rewind (abandoned branch of two turns), a
duplicated uuid, an isMeta prompt that opens its own turn, `!` bash mode, a queued message with a paste, a legacy
`Task` call with a synchronous result, an interrupt by shutdown and a compact summary without a boundary.
Assertions live in `src/lib/transcript/edge-cases.test.ts`.

In real data the main file is `<sessionId>.jsonl` and the sibling directory is `<sessionId>/`. Here the
basename is `synthetic-session`, while the `sessionId` field inside every record is
`5e55a0de-0000-4000-8000-000000000001`. A viewer should look for subagents in `<basename-of-jsonl>/subagents/`.

Every line is valid JSON (checked with `jq -c . file > /dev/null`). Timestamps go up line by line (in real files they
don't always; see the doc). uuids are sequential (`00000000-0000-4000-8000-0000000000NN`) so the tree is easy to follow by eye.

## What the main file covers, in order

| Lines (0-based) | Scenario | Things to check in the viewer |
|---|---|---|
| 0-1 | `permission-mode`, `mode` | Metadata records with no envelope (no uuid or timestamp) |
| 2-3 | SessionStart `hook_success` + `hook_additional_context` attachments | First record has `parentUuid: null` |
| 4-9 | `/model opus` local slash command as 3 user records (meta caveat, `<command-name>`, `<local-command-stdout>` with ANSI escapes), then `/effort high` as a `system/local_command` pair with `commandRun` | Slash-command chip; strip ANSI codes |
| 10-23 | Human prompt with `<pasted_content id="a1f3">` + `@src/cli.py` mention -> `file` attachment, many context attachments (skill_listing, deferred_tools_delta, environment, model, date, session_context, prompt_snapshot, total_tokens_reminder), then `last-prompt` / `ai-title` / `atis-latch` | Show "[Pasted text #1 +3 lines]" (+M = newline count of the pasted text: 4 lines, 3 newlines); hide or collapse context attachments |
| 24-30 | One API message (`msg_…01`) split into 4 records (thinking with empty text + signature + `thinkingDurationMs`, text, Bash tool_use, Read tool_use). Only the last record has `stop_reason` and the real `output_tokens`. Parallel tool results: each `tool_result` is a child of its own tool_use record, so the uuid tree branches. `bash_output_audience_note` attachment sits between them | Group by `message.id`; pair `tool_use.id` with `tool_result.tool_use_id`; do not walk a single parent chain |
| 31-35 | Thinking with visible text, Grep + Glob in parallel | |
| 36-39 | Edit with `structuredPatch`, `diagnostics` attachment, `file-history-delta` | Diff rendering |
| 40-42 | Write (create) + `edited_text_file` attachment | |
| 43-46 | Read of a 1x1 PNG (image block in tool_result + `toolUseResult.file.base64`), Read of a PDF (`document` block) | Image and document rendering |
| 47-49 | Final text (`end_turn`), `stop_hook_summary`, `turn_duration` | Turn footer: duration |
| 50 | User prompt as an array: text + `image` block | Pasted image |
| 51-58 | WebSearch + WebFetch in parallel; a message typed mid-turn shows up as `queue-operation` enqueue/remove plus a `queued_command` attachment (`origin.kind: "human"`) | Show the queued message as a user bubble |
| 59-63 | AskUserQuestion (questions + answers), Skill tool + the `isMeta` user record carrying the skill body (`sourceToolUseID`, `turnCompanion`) | |
| 64-68 | ToolSearch (`tool_reference` block), failing Bash (`is_error: true`, string `toolUseResult`), `hook_system_message` | Error styling |
| 69-71 | End of turn | |
| 72-81 | Background `Agent` tool_use -> `async_launched` result with `agentId`; later a `<task-notification>` user record and an `<agent-message>` hand-back (`isMeta`, `origin.kind: "peer"`, `handback: true`), `task_status` attachment | Link the Agent call to `synthetic-session/subagents/agent-a5e55a0de00000001.jsonl` through `meta.json` `toolUseId` or `toolUseResult.agentId` |
| 82-83 | `/btw` as `system/local_command` pair; the fork transcript is in the subagents dir | |
| 84-87 | Tool use rejected by the user (`toolDenialKind`, then `[Request interrupted by user for tool use]` with `interruptedMessageId`) | |
| 88-90 | Streaming cut off (`isAbortedMidStream: true`, no `stop_reason`), then `[Request interrupted by user]` | |
| 91-96 | API error message (`model: "<synthetic>"`, `isApiErrorMessage`, `apiErrorStatus: 529`), then a rewind: a second user prompt with the **same parent** as line 91 (sibling branch). The first branch (91-92) is abandoned | Only the branch that ends at the last uuid record in the file is active |
| 97-103 | `turn_duration`, `away_summary`, `informational`, `compact_boundary` (`parentUuid: null`, `logicalParentUuid`, `compactMetadata`), the `isCompactSummary` user record, `compact_file_reference` + `invoked_skills` attachments | Compaction divider |
| 104-113 | `fallback` content block (model switch mid-stream), Bash result with `<persisted-output>` + `persistedOutputPath`, `read_truncation_notice`, `silent_turn_reminder`, `batching_reminder_sent`, `task_reminder` | |
| 114-120 | Trailing metadata: `last-prompt`, `ai-title`, `atis-latch`, `agent-name`, `cost-state`, `continued-in`, `last-prompt` (leaf only) | Session header: title, cost, "continued in …" link |

## Not covered (not seen in the real corpus)

`redacted_thinking`, `server_tool_use` / `web_search_tool_result` content blocks, TodoWrite/Task* tool results,
MCP tool results, workflow transcripts (`subagents/workflows/<runId>/` + `journal.jsonl`) and legacy `summary`
records. The doc describes what is known about each.
