import json, os, base64, sys, uuid as _uuid, datetime
OUT = sys.argv[1]
SID = "5e55a0de-0000-4000-8000-000000000001"
CWD = "/home/dev/demo-project"
VER = "2.1.295"
BASE = datetime.datetime(2026, 10, 20, 9, 0, 0, tzinfo=datetime.timezone.utc)
_t = [0]
def ts(step=0.4):
    _t[0] += int(round(step * 1000))
    t = BASE + datetime.timedelta(milliseconds=_t[0])
    return t.strftime('%Y-%m-%dT%H:%M:%S.') + '%03dZ' % (t.microsecond // 1000)
_n = [0]
def U():
    _n[0] += 1
    return "00000000-0000-4000-8000-%012d" % _n[0]
_m = [0]
def MID():
    _m[0] += 1
    return "msg_01SYNTH%016d" % _m[0]
def RID():
    return "req_01SYNTH%016d" % _m[0]
_tu = [0]
def TUID():
    _tu[0] += 1
    return "toolu_01SYNTH%011d" % _tu[0]
PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
PDF = base64.b64encode(b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n").decode()
SIG = "EsYBCkgIBhABGAIiQFNZTlRIRVRJQy1TSUdOQVRVUkUtUExBQ0VIT0xERVI="

lines = []
last = [None]   # uuid of last record on the active chain
def env(rec_type, parent="__last__", **kw):
    d = {"parentUuid": last[0] if parent == "__last__" else parent, "isSidechain": False}
    d.update(kw.pop("_pre", {}))
    d["type"] = rec_type
    return d
def tail(d, uid=None, t=None):
    d.setdefault("uuid", uid or U())
    d.setdefault("timestamp", t or ts())
    d.update({"userType": "external", "entrypoint": "cli", "cwd": CWD, "sessionId": SID, "version": VER, "gitBranch": "main"})
    return d
def emit(d, advance=True):
    lines.append(d)
    if advance and d.get("uuid"): last[0] = d["uuid"]
    return d
def meta(d):  # records without the envelope
    lines.append(d); return d

def attachment(att, parent="__last__", rendered=None, role=None, **extra):
    d = env("attachment", parent)
    d["attachment"] = att
    tail(d)
    if rendered is not None:
        d["rendered"] = [{"content": r} for r in rendered]
    if role: d["renderedRole"] = role
    d.update(extra)
    return emit(d)

def user(content, parent="__last__", promptId=None, **extra):
    d = env("user", parent)
    if promptId: d["promptId"] = promptId
    d["message"] = {"role": "user", "content": content}
    tail(d)
    d.update(extra)
    return emit(d)

USAGE0 = lambda inp, cr, cc, out: {"input_tokens": inp, "cache_creation_input_tokens": cc, "cache_read_input_tokens": cr, "output_tokens": out,
    "server_tool_use": {"web_search_requests": 0, "web_fetch_requests": 0}, "service_tier": "standard",
    "cache_creation": {"ephemeral_1h_input_tokens": cc, "ephemeral_5m_input_tokens": 0}, "inference_geo": "not_available", "iterations": [], "speed": "standard"}

def assistant_msg(blocks, stop="tool_use", inp=3, cr=18000, cc=1200, out_final=420, parent="__last__", final_usage=True, model="claude-opus-5-5", extra_last=None, thinking_ms=None):
    """Emit one record per content block (as CC does). Returns list of records. Each record's parent is the previous block record."""
    mid, rid = MID(), RID()
    recs = []
    p = last[0] if parent == "__last__" else parent
    for i, b in enumerate(blocks):
        is_last = i == len(blocks) - 1
        u = USAGE0(inp, cr, cc, out_final if (is_last and final_usage) else 8)
        if is_last and final_usage:
            u["output_tokens_details"] = {"thinking_tokens": 120 if any(x["type"] == "thinking" for x in blocks) else 0}
            u["iterations"] = [{"input_tokens": inp, "output_tokens": out_final, "cache_read_input_tokens": cr, "cache_creation_input_tokens": cc, "type": "message"}]
        d = {"parentUuid": p, "isSidechain": False,
             "message": {"model": model, "id": mid, "type": "message", "role": "assistant", "content": [b], "container": None,
                         "stop_reason": (stop if (is_last and final_usage) else None), "stop_sequence": None, "stop_details": None,
                         "usage": u, "diagnostics": None, "context_management": None, "input_transformations": []},
             "requestId": rid, "apiBlockIndex": i, "serverClassifierRequest": "5e55a0de-c1a5-4000-8000-%012d" % _m[0],
             "type": "assistant", "advisorModel": model, "effort": "high", "perTurnEffort": "high"}
        if b["type"] == "tool_use":
            d["wireToolInputs"] = {b["id"]: b["input"]}
        if b["type"] == "thinking" and thinking_ms:
            d["thinkingDurationMs"] = thinking_ms
        tail(d, t=ts(1.1))
        if is_last and extra_last: d.update(extra_last)
        lines.append(d); recs.append(d); p = d["uuid"]
    last[0] = p
    return recs

def tool_result(asst_rec, content, tur, is_error=None, parent=None, promptId=None, **extra):
    tu = asst_rec["message"]["content"][0]
    blk = {"tool_use_id": tu["id"], "type": "tool_result", "content": content}
    if is_error is not None: blk["is_error"] = is_error
    d = {"parentUuid": parent or asst_rec["uuid"], "isSidechain": False}
    if promptId: d["promptId"] = promptId
    d.update({"type": "user", "message": {"role": "user", "content": [blk]}})
    tail(d)
    if tur is not None: d["toolUseResult"] = tur
    d["sourceToolAssistantUUID"] = asst_rec["uuid"]
    d.update(extra)
    lines.append(d); last[0] = d["uuid"]
    return d

def sysrec(subtype, parent="__last__", **fields):
    d = env("system", parent)
    d["subtype"] = subtype
    d.update(fields)
    tail(d)
    return emit(d)

def tu(name, inp):
    return {"type": "tool_use", "id": TUID(), "name": name, "input": inp, "caller": {"type": "direct"}}
def think(text=""):
    return {"type": "thinking", "thinking": text, "signature": SIG}
def text(t):
    return {"type": "text", "text": t}

def stop_hooks():
    sysrec("stop_hook_summary", hookCount=1, hookInfos=[{"command": "${CLAUDE_PLUGIN_ROOT}/hooks/example-stop-hook.sh"}], hookErrors=[], hookAdditionalContext=[],
           preventedContinuation=False, stopReason="", hasOutput=False, level="suggestion", toolUseID=U(), session_id=SID)
def turn_duration(ms, n, **kw):
    sysrec("turn_duration", durationMs=ms, messageCount=n, isMeta=False, **kw)

def titles(prompt):
    meta({"type": "last-prompt", "lastPrompt": prompt[:200], "leafUuid": last[0], "sessionId": SID})
    meta({"type": "ai-title", "aiTitle": "Add a word-count CLI to demo project", "sessionId": SID})
    meta({"type": "atis-latch", "atis": "", "sessionId": SID})

# ---------------------------------------------------------------- session start
meta({"type": "permission-mode", "permissionMode": "default", "sessionId": SID})
meta({"type": "mode", "mode": "normal", "sessionId": SID})
attachment({"type": "hook_success", "hookName": "SessionStart:startup", "toolUseID": U(), "hookEvent": "SessionStart", "content": "",
            "stdout": "{\"hookSpecificOutput\":{\"hookEventName\":\"SessionStart\",\"additionalContext\":\"Demo hook context.\"}}", "stderr": "", "exitCode": 0,
            "command": "${CLAUDE_PLUGIN_ROOT}/hooks/session-start.sh", "durationMs": 87}, parent=None)
attachment({"type": "hook_additional_context", "content": ["Demo hook context."], "hookName": "SessionStart", "toolUseID": "SessionStart", "hookEvent": "SessionStart"},
           rendered=["<system-reminder>\nSessionStart hook additional context: Demo hook context.\n</system-reminder>"], role="system")

# ---------------------------------------------------------------- turn 1: local slash command (/model) as user records
P1 = "5e55a0de-9000-4000-8000-000000000001"
caveat_uuid = U()
meta({"type": "file-history-snapshot", "messageId": "00000000-0000-4000-8000-%012d" % (_n[0] + 1), "snapshot": {"messageId": "00000000-0000-4000-8000-%012d" % (_n[0] + 1), "trackedFileBackups": {}, "timestamp": ts()}, "isSnapshotUpdate": False})
d = env("user"); d["promptId"] = P1; d["message"] = {"role": "user", "content": "<local-command-caveat>Caveat: The messages below were generated by the user while running local commands. DO NOT respond to these messages or otherwise consider them in your response unless the user explicitly asks you to.</local-command-caveat>"}
tail(d, uid=caveat_uuid); d["isMeta"] = True; emit(d)
user("<command-name>/model</command-name>\n            <command-message>model</command-message>\n            <command-args>opus</command-args>", promptId=P1)
user("<local-command-stdout>Set model to \u001b[1mOpus 5.5\u001b[22m and saved as your default for new sessions</local-command-stdout>", promptId=P1)
# same thing, newer representation: system/local_command pair
sysrec("local_command", content="<command-name>/effort</command-name>\n            <command-message>effort</command-message>\n            <command-args>high</command-args>", level="info", isMeta=False)
sysrec("local_command", content="<local-command-stdout>Set effort level to high</local-command-stdout>", level="info", isMeta=False, commandRun={"command": "effort", "args": "high"})

# ---------------------------------------------------------------- turn 2: human prompt with pasted text + @file mention
P2 = "5e55a0de-9000-4000-8000-000000000002"
prompt2 = ("Add a word-count command to @src/cli.py. Here is the spec I was given:\n\n"
           "<pasted_content id=\"a1f3\">\nSPEC PLACEHOLDER LINE 1\nSPEC PLACEHOLDER LINE 2\nSPEC PLACEHOLDER LINE 3\nSPEC PLACEHOLDER LINE 4\n</pasted_content id=\"a1f3\">\n")
meta({"type": "file-history-snapshot", "messageId": "00000000-0000-4000-8000-%012d" % (_n[0] + 1), "snapshot": {"messageId": "00000000-0000-4000-8000-%012d" % (_n[0] + 1), "trackedFileBackups": {}, "timestamp": ts()}, "isSnapshotUpdate": False})
u2 = user(prompt2, promptId=P2, permissionMode="default", promptSource="typed", origin={"kind": "human"}, turnOrigin="human", turnPosition={"promptIndex": 1, "turnIndex": 1})
attachment({"type": "file", "filename": CWD + "/src/cli.py", "content": {"type": "text", "file": {"filePath": CWD + "/src/cli.py", "content": "import sys\n\ndef main():\n    print('hello')\n", "numLines": 4, "startLine": 1, "totalLines": 4}}, "displayPath": "src/cli.py"},
           rendered=["<system-reminder>\nCalled the Read tool with the following input: {\"file_path\":\"" + CWD + "/src/cli.py\"}\n</system-reminder>",
                     "<system-reminder>\nResult of calling the Read tool:\n1\timport sys\n2\t\n3\tdef main():\n4\t    print('hello')\n</system-reminder>"], role="user")
attachment({"type": "skill_listing", "content": "- demo:skill-one: Placeholder skill description", "skillCount": 1, "isInitial": True, "names": ["demo:skill-one"]},
           rendered=["<system-reminder>\nThe following skills are available for use with the Skill tool:\n\n- demo:skill-one: Placeholder skill description\n</system-reminder>"], role="system")
attachment({"type": "deferred_tools_delta", "addedNames": ["WebFetch", "WebSearch"], "addedLines": ["WebFetch", "WebSearch"], "removedNames": [], "readdedNames": [], "wireHiddenNames": [], "surfacedNames": []},
           rendered=["<system-reminder>\nThe following deferred tools are now available via ToolSearch: WebFetch, WebSearch\n</system-reminder>"], role="system")
attachment({"type": "environment", "snapshot": {"workingDirectory": CWD, "isWorktree": False, "isGitRepo": True, "additionalWorkingDirectories": [], "platform": "linux", "shell": "bash", "osVersion": "Linux 6.0"}},
           rendered=["<system-reminder>\n# Environment\n - Primary working directory: " + CWD + "\n</system-reminder>"], role="system")
attachment({"type": "model", "identity": {"modelId": "claude-opus-5-5", "marketingName": "Opus 5.5", "knowledgeCutoff": "June 2026"}, "text": "You are powered by the model named Opus 5.5."},
           rendered=["<system-reminder>\nYou are powered by the model named Opus 5.5.\n</system-reminder>"], role="system")
attachment({"type": "date", "date": "2026-10-20"}, rendered=["<system-reminder>\nToday's date is 2026-10-20.\n</system-reminder>"], role="system")
attachment({"type": "session_context", "context": {"userEmail": "The user's email address is dev@example.com."}},
           rendered=["<system-reminder>\nAs you answer the user's questions, you can use the following context:\n# userEmail\nThe user's email address is dev@example.com.\n</system-reminder>"], role="user")
attachment({"type": "prompt_snapshot", "systemPrompt": ["You are Claude Code (synthetic placeholder system prompt)."], "reminderFold": False, "echoWireToolInputs": True, "contextRendering": "announced"})
attachment({"type": "total_tokens_reminder", "text": "<total_tokens>1000000 tokens left</total_tokens>"},
           rendered=["<system-reminder>\n<total_tokens>1000000 tokens left</total_tokens>\n</system-reminder>"], role="system")
titles(prompt2)

a1 = assistant_msg([think(""), text("I'll look at the current CLI and the tests first."),
                    tu("Bash", {"command": "ls src tests", "description": "List source and test files"}),
                    tu("Read", {"file_path": CWD + "/tests/test_cli.py"})], thinking_ms=2310, out_final=512)
# parallel tool results: each result is a child of ITS tool_use record (tree branches here)
tool_result(a1[2], "cli.py\n__init__.py\ntest_cli.py", {"stdout": "cli.py\n__init__.py\ntest_cli.py", "stderr": "", "interrupted": False, "isImage": False, "noOutputExpected": False}, is_error=False, promptId=P2)
attachment({"type": "bash_output_audience_note", "toolUseID": a1[2]["message"]["content"][0]["id"]},
           rendered=["<system-reminder>\nOnly you see that command's output.\n</system-reminder>"], role="system")
tool_result(a1[3], "1\tdef test_placeholder():\n2\t    assert True\n",
            {"type": "text", "file": {"filePath": CWD + "/tests/test_cli.py", "content": "def test_placeholder():\n    assert True\n", "numLines": 2, "startLine": 1, "totalLines": 2}}, promptId=P2)

a2 = assistant_msg([think("Need to find where argument parsing happens; grep for argv, then glob for other entry points."),
                    tu("Grep", {"pattern": "argv", "path": "src", "output_mode": "content", "-n": True}),
                    tu("Glob", {"pattern": "**/*.py"})], thinking_ms=1450, out_final=210)
tool_result(a2[1], "src/cli.py:1:import sys", {"mode": "content", "numFiles": 0, "filenames": [], "content": "src/cli.py:1:import sys", "numLines": 1}, promptId=P2)
tool_result(a2[2], "src/cli.py\nsrc/__init__.py\ntests/test_cli.py", {"filenames": ["src/cli.py", "src/__init__.py", "tests/test_cli.py"], "durationMs": 9, "numFiles": 3, "truncated": False, "totalMatches": 3, "countIsComplete": True}, promptId=P2)

a3 = assistant_msg([tu("Edit", {"file_path": CWD + "/src/cli.py", "old_string": "    print('hello')", "new_string": "    print(len(sys.stdin.read().split()))", "replace_all": False})], out_final=95)
tool_result(a3[0], "The file " + CWD + "/src/cli.py has been updated successfully.",
            {"filePath": CWD + "/src/cli.py", "oldString": "    print('hello')", "newString": "    print(len(sys.stdin.read().split()))",
             "originalFile": "import sys\n\ndef main():\n    print('hello')\n",
             "structuredPatch": [{"oldStart": 3, "oldLines": 2, "newStart": 3, "newLines": 2, "lines": [" def main():", "-    print('hello')", "+    print(len(sys.stdin.read().split()))"]}],
             "userModified": False, "replaceAll": False}, promptId=P2)
attachment({"type": "diagnostics", "files": [{"uri": CWD + "/src/cli.py", "diagnostics": [{"message": "Function is missing a return type annotation", "severity": "Warning", "range": {"start": {"line": 2, "character": 4}, "end": {"line": 2, "character": 8}}, "source": "pyright"}]}], "isNew": True},
           rendered=["<system-reminder>\n<new-diagnostics>The following new diagnostic issues were detected:\n\ncli.py:\n  ⚠ [Line 3:5] Function is missing a return type annotation [pyright]\n</new-diagnostics>\n</system-reminder>"], role="system")
meta({"type": "file-history-delta", "messageId": u2["uuid"], "snapshotMessageId": u2["uuid"], "trackingPath": "src/cli.py",
      "backup": {"backupFileName": "0123456789abcdef@v1", "version": 1, "backupTime": ts(), "realParentDir": CWD + "/src"}, "timestamp": ts()})

a4 = assistant_msg([tu("Write", {"file_path": CWD + "/tests/test_wc.py", "content": "def test_wc():\n    assert True\n"})], out_final=80)
tool_result(a4[0], "File created successfully at: " + CWD + "/tests/test_wc.py",
            {"type": "create", "filePath": CWD + "/tests/test_wc.py", "content": "def test_wc():\n    assert True\n", "structuredPatch": [], "originalFile": None, "userModified": False}, promptId=P2)
attachment({"type": "edited_text_file", "filename": CWD + "/tests/test_wc.py", "snippet": "1\tdef test_wc():\n2\t    assert True"},
           rendered=["<system-reminder>\nNote: " + CWD + "/tests/test_wc.py was modified, either by the user or by a linter.\n</system-reminder>"], role="system")

a5 = assistant_msg([tu("Read", {"file_path": CWD + "/docs/logo.png"})], out_final=40)
tool_result(a5[0], [{"type": "image", "source": {"type": "base64", "data": PNG, "media_type": "image/png"}}],
            {"type": "image", "file": {"base64": PNG, "type": "image/png", "originalSize": 70, "dimensions": {"originalWidth": 1, "originalHeight": 1, "displayWidth": 1, "displayHeight": 1}}}, promptId=P2)
a5b = assistant_msg([tu("Read", {"file_path": CWD + "/docs/spec.pdf"})], out_final=40)
tool_result(a5b[0], [{"type": "text", "text": "PDF file read: " + CWD + "/docs/spec.pdf (0 pages)"}, {"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": PDF}}],
            {"type": "pdf", "file": {"filePath": CWD + "/docs/spec.pdf", "base64": PDF, "originalSize": len(base64.b64decode(PDF))}}, promptId=P2)

a6 = assistant_msg([text("Done. `src/cli.py` now prints the word count of stdin, and I added `tests/test_wc.py`.")], stop="end_turn", out_final=60)
stop_hooks(); turn_duration(41250, 24)

# ---------------------------------------------------------------- turn 3: prompt with an image block, web tools, queued message, AskUserQuestion, Skill, ToolSearch
P3 = "5e55a0de-9000-4000-8000-000000000003"
prompt3_text = "Here is a screenshot of the expected output [Image #1]. Can you check the docs for best practice?"
u3 = user([{"type": "text", "text": prompt3_text}, {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": PNG}}],
          promptId=P3, permissionMode="default", promptSource="typed", origin={"kind": "human"}, turnOrigin="human")
a7 = assistant_msg([think(""), tu("WebSearch", {"query": "python cli word count best practice"}), tu("WebFetch", {"url": "https://example.com/docs", "prompt": "Summarize the CLI guidance"})], thinking_ms=900, out_final=150)
tool_result(a7[1], "Web search results for query: \"python cli word count best practice\"\n\nLinks: [{\"title\":\"Example Docs\",\"url\":\"https://example.com/docs\"}]",
            {"query": "python cli word count best practice", "results": [{"tool_use_id": "srvtoolu_01SYNTH0000000001", "content": [{"title": "Example Docs", "url": "https://example.com/docs"}]}, "Summary text placeholder."], "durationSeconds": 3.2, "searchCount": 1}, promptId=P3)
meta({"type": "queue-operation", "operation": "enqueue", "timestamp": ts(), "sessionId": SID, "content": "also make it handle empty input"})
tool_result(a7[2], "The page recommends reading from stdin and using argparse. (placeholder)",
            {"bytes": 5120, "code": 200, "codeText": "OK", "result": "The page recommends reading from stdin and using argparse. (placeholder)", "durationMs": 640, "url": "https://example.com/docs"}, promptId=P3)
qc_uuid = U()
attachment({"type": "queued_command", "prompt": "also make it handle empty input", "source_uuid": qc_uuid, "delivery_id": "5e55a0de-de11-4000-8000-000000000001", "commandMode": "prompt", "origin": {"kind": "human"}, "timestamp": ts(), "humanTurn": True},
           rendered=["<system-reminder>\nThe user sent a new message while you were working:\nalso make it handle empty input\n</system-reminder>"], role="system")
meta({"type": "queue-operation", "operation": "remove", "timestamp": ts(), "sessionId": SID, "content": "also make it handle empty input", "reason": "absorbed_mid_turn", "commandUuid": qc_uuid, "deliveryId": "5e55a0de-de11-4000-8000-000000000001"})

a8 = assistant_msg([tu("AskUserQuestion", {"questions": [{"question": "Should empty input print 0 or nothing?", "header": "Empty input", "multiSelect": False, "options": [{"label": "Print 0", "description": "Always print a number"}, {"label": "Print nothing", "description": "Silent on empty input"}]}]})], out_final=70)
tool_result(a8[0], "The user answered: \"Should empty input print 0 or nothing?\"=\"Print 0\".",
            {"questions": [{"question": "Should empty input print 0 or nothing?", "header": "Empty input", "options": [{"label": "Print 0", "description": "Always print a number"}, {"label": "Print nothing", "description": "Silent on empty input"}], "multiSelect": False}],
             "answers": {"Should empty input print 0 or nothing?": "Print 0"}, "annotations": {}}, promptId=P3)
a9 = assistant_msg([tu("Skill", {"skill": "demo:skill-one"})], out_final=30)
tool_result(a9[0], "Launching skill: demo:skill-one", {"success": True, "commandName": "demo:skill-one"}, promptId=P3, permissionDecision={"decision": "accept", "source": "config", "reasonType": "mode"})
user([{"type": "text", "text": "Base directory for this skill: /home/dev/.claude/skills/skill-one\n\n# Skill one\n(placeholder skill body)"}], promptId=P3, isMeta=True, sourceToolUseID=a9[0]["message"]["content"][0]["id"], turnCompanion=True)
a10 = assistant_msg([tu("ToolSearch", {"query": "select:Monitor", "max_results": 1})], out_final=25)
tool_result(a10[0], [{"type": "tool_reference", "tool_name": "Monitor"}], {"matches": ["Monitor"], "query": "select:Monitor", "total_deferred_tools": 12}, promptId=P3)
a10b = assistant_msg([tu("Bash", {"command": "python -m pytest -q", "description": "Run tests"})], out_final=30)
tool_result(a10b[0], "Exit code 1\n1 failed, 1 passed", "Error: Exit code 1\n1 failed, 1 passed", is_error=True, promptId=P3)
attachment({"type": "hook_system_message", "content": "Tip: placeholder message from a PostToolUse hook.", "hookName": "PostToolUse:Bash", "toolUseID": a10b[0]["message"]["content"][0]["id"], "hookEvent": "PostToolUse"})
a11 = assistant_msg([text("Empty input now prints `0`. One test fails because of a placeholder assertion; I left it for you to decide.")], stop="end_turn", out_final=55)
stop_hooks(); turn_duration(28800, 18)

# ---------------------------------------------------------------- turn 4: background Agent (subagent lives in a separate file)
P4 = "5e55a0de-9000-4000-8000-000000000004"
AGENT_ID = "a5e55a0de00000001"
u4 = user("Spawn a background agent to review the change.", promptId=P4, permissionMode="default", promptSource="typed", origin={"kind": "human"}, turnOrigin="human")
a12 = assistant_msg([tu("Agent", {"description": "Review word-count change", "subagent_type": "general-purpose", "run_in_background": True, "prompt": "Review src/cli.py for bugs. (placeholder prompt)"})], out_final=140)
AGENT_TOOL_ID = a12[0]["message"]["content"][0]["id"]
tool_result(a12[0], [{"type": "text", "text": "Async agent launched successfully.\nagentId: " + AGENT_ID + " (internal ID)"}],
            {"isAsync": True, "status": "async_launched", "agentId": AGENT_ID, "description": "Review word-count change", "resolvedModel": "claude-opus-5-5",
             "prompt": "Review src/cli.py for bugs. (placeholder prompt)", "outputFile": "/tmp/claude/tasks/" + AGENT_ID + ".output", "canReadOutputFile": True, "canContinueAgent": True}, promptId=P4)
a13 = assistant_msg([text("Launched a background reviewer; I'll report when it finishes.")], stop="end_turn", out_final=20)
stop_hooks(); turn_duration(6100, 5, pendingBackgroundAgentCount=1)
user("<task-notification>\n<task-id>" + AGENT_ID + "</task-id>\n<tool-use-id>" + AGENT_TOOL_ID + "</tool-use-id>\n<output-file>/tmp/claude/tasks/" + AGENT_ID + ".output</output-file>\n<status>completed</status>\n<summary>Agent \"Review word-count change\" finished</summary>\n</task-notification>",
     origin={"kind": "task-notification"}, turnOrigin="task_notification", promptSource="system")
user("Another Claude session sent a message:\n<agent-message from=\"" + AGENT_ID + "\">\n[Subagent hand-back] The text below is the final report of a subagent.\n    No bugs found. (placeholder report)\n</agent-message>",
     isMeta=True, origin={"kind": "peer", "from": AGENT_ID, "senderTaskId": AGENT_ID, "body": "[Subagent hand-back] No bugs found. (placeholder report)", "handback": True}, turnOrigin="peer", queueSkipAttachments=True)
attachment({"type": "task_status", "taskId": AGENT_ID, "taskType": "local_agent", "description": "Review word-count change", "status": "completed", "deltaSummary": None, "outputFilePath": "/tmp/claude/tasks/" + AGENT_ID + ".output", "canContinueAgent": True},
           rendered=["<system-reminder>\nTask " + AGENT_ID + " (type: local_agent) (status: completed) (description: Review word-count change)\n</system-reminder>"], role="system")
a14 = assistant_msg([text("The reviewer found no bugs.")], stop="end_turn", out_final=12)

# ---------------------------------------------------------------- /btw fork (separate subagent file with fork-context-ref)
FORK_PARENT_LAST = last[0]
sysrec("local_command", content="<command-name>/btw</command-name>\n            <command-message>btw</command-message>\n            <command-args></command-args>", level="info", isMeta=False)
sysrec("local_command", content="<local-command-stdout>⑂ forked what-is-wc (0001)</local-command-stdout>", level="info", isMeta=False, commandRun={"command": "btw", "args": ""})

# ---------------------------------------------------------------- turn 5: tool rejected by user
P5 = "5e55a0de-9000-4000-8000-000000000005"
u5 = user("Now delete the old build directory.", promptId=P5, origin={"kind": "human"}, turnOrigin="human")
a15 = assistant_msg([tu("Bash", {"command": "rm -rf build", "description": "Delete build directory"})], out_final=30)
tool_result(a15[0], "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). STOP what you are doing and wait for the user to tell you how to proceed.",
            "Error: The user doesn't want to proceed with this tool use.", is_error=True, promptId=P5, toolDenialKind="user-rejected")
user([{"type": "text", "text": "[Request interrupted by user for tool use]"}], promptId=P5, interruptedMessageId=a15[0]["message"]["id"])

# ---------------------------------------------------------------- turn 6: streaming interrupted by Esc
P6 = "5e55a0de-9000-4000-8000-000000000006"
user("Explain the change in detail.", promptId=P6, origin={"kind": "human"}, turnOrigin="human")
a16 = assistant_msg([text("Sure. The change reads all of stdin, splits on")], final_usage=False, extra_last={"isAbortedMidStream": True})
user([{"type": "text", "text": "[Request interrupted by user]"}], promptId=P6)

# ---------------------------------------------------------------- turn 7: API error, then a rewind (two sibling user prompts)
P7 = "5e55a0de-9000-4000-8000-000000000007"
branch_parent = last[0]
user("Summarize the session.", promptId=P7, origin={"kind": "human"}, turnOrigin="human")
d = {"parentUuid": last[0], "isSidechain": False, "type": "assistant",
     "message": {"id": "5e55a0de-e440-4000-8000-000000000001", "container": None, "model": "<synthetic>", "role": "assistant", "stop_details": None, "stop_reason": "stop_sequence", "stop_sequence": "", "type": "message",
                 "usage": {"input_tokens": 0, "output_tokens": 0, "cache_creation_input_tokens": 0, "cache_read_input_tokens": 0, "server_tool_use": {"web_search_requests": 0, "web_fetch_requests": 0}, "service_tier": None, "cache_creation": {"ephemeral_1h_input_tokens": 0, "ephemeral_5m_input_tokens": 0}, "inference_geo": None, "iterations": None, "speed": None},
                 "content": [text("API Error: 529 Overloaded. This is a server-side issue, usually temporary.")], "diagnostics": None, "context_management": None},
     "error": "server_error", "isApiErrorMessage": True, "apiErrorStatus": 529}
tail(d); emit(d)
# user rewound (Esc Esc) and re-sent a different prompt from the same parent -> sibling branch
meta({"type": "file-history-snapshot", "messageId": "00000000-0000-4000-8000-%012d" % (_n[0] + 1), "snapshot": {"messageId": "00000000-0000-4000-8000-%012d" % (_n[0] + 1), "trackedFileBackups": {CWD + "/src/cli.py": {"backupFileName": "0123456789abcdef@v2", "version": 2, "backupTime": ts()}}, "timestamp": ts()}, "isSnapshotUpdate": False})
user("Summarize the session in one sentence.", parent=branch_parent, promptId="5e55a0de-9000-4000-8000-000000000008", origin={"kind": "human"}, turnOrigin="human")
a17 = assistant_msg([think(""), text("We added a word-count command with tests and a background review.")], stop="end_turn", thinking_ms=400, out_final=33)
turn_duration(2500, 4)
sysrec("away_summary", content="Added a word-count CLI and tests; review passed. Next: decide on the failing placeholder test. (disable recaps in /config)", isMeta=False)

# ---------------------------------------------------------------- compaction
pre_compact = last[0]
sysrec("informational", content="Compacted while idle, before the prompt cache expired", isMeta=False, level="notice")
cb = sysrec("compact_boundary", parent=None, logicalParentUuid=pre_compact, content="Conversation compacted", isMeta=False, level="info",
            compactMetadata={"trigger": "auto", "preTokens": 151000, "durationMs": 42000, "preCompactDiscoveredTools": ["WebSearch"],
                             "preservedSegment": {"headUuid": a17[0]["uuid"], "anchorUuid": a17[-1]["uuid"], "tailUuid": pre_compact},
                             "postTokens": 9000, "cumulativeDroppedTokens": 142000})
user("This session is being continued from a previous conversation that ran out of context. The summary below covers the earlier portion of the conversation.\n\nSummary:\n1. Primary Request and Intent: (placeholder summary)",
     promptId="5e55a0de-9000-4000-8000-000000000009", isVisibleInTranscriptOnly=True, isCompactSummary=True)
attachment({"type": "compact_file_reference", "filename": CWD + "/src/cli.py", "displayPath": "src/cli.py"},
           rendered=["<system-reminder>\nNote: " + CWD + "/src/cli.py was read before the last conversation was summarized.\n</system-reminder>"], role="system")
attachment({"type": "invoked_skills", "skills": [{"name": "demo:skill-one", "path": "userSettings:skill-one", "content": "(placeholder skill body)"}]},
           rendered=["<system-reminder>\nThe following skills were invoked EARLIER in this session (before the conversation was compacted)...\n</system-reminder>"], role="system")

# ---------------------------------------------------------------- turn 9: model fallback block + misc reminders
P9 = "5e55a0de-9000-4000-8000-000000000010"
user("Run the tests one more time.", promptId=P9, origin={"kind": "human"}, turnOrigin="human")
attachment({"type": "batching_reminder_sent", "text": "Request independent items in one response.", "model": "claude-opus-5-5", "clearAt": "next_user_message"})
attachment({"type": "task_reminder", "content": [], "itemCount": 0}, rendered=["<system-reminder>\nThe task tools haven't been used recently. (placeholder)\n</system-reminder>"])
a18 = assistant_msg([{"type": "fallback", "from": {"model": "claude-fable-5-1"}, "to": {"model": "claude-opus-5-5"}}, tu("Bash", {"command": "python -m pytest -q", "description": "Run tests"})], out_final=44)
tool_result(a18[1], "<persisted-output>\nOutput too large (31.0KB). Full output saved to: /home/dev/.claude/projects/-home-dev-demo-project/" + SID + "/tool-results/toolu_01SYNTH00000000099.txt\n\nPreview (first 2KB):\n2 passed\n</persisted-output>",
            {"stdout": "2 passed", "stderr": "", "interrupted": False, "isImage": False, "noOutputExpected": False, "persistedOutputPath": "/home/dev/.claude/projects/-home-dev-demo-project/" + SID + "/tool-results/toolu_01SYNTH00000000099.txt", "persistedOutputSize": 31744}, is_error=False, promptId=P9)
attachment({"type": "read_truncation_notice", "banner": "[Truncated: PARTIAL view of a large tool output (placeholder)]", "toolUseID": a18[1]["message"]["content"][0]["id"]},
           rendered=["<system-reminder>\n[Truncated: PARTIAL view of a large tool output (placeholder)]\n</system-reminder>"], role="system")
attachment({"type": "silent_turn_reminder", "text": "The user hasn't heard from you in a while — say in a few words what you're doing, then continue."},
           rendered=["<system-reminder>\nThe user hasn't heard from you in a while — say in a few words what you're doing, then continue.\n</system-reminder>"], role="system")
a19 = assistant_msg([text("All tests pass now.")], stop="end_turn", out_final=9)
turn_duration(9100, 6)

# ---------------------------------------------------------------- trailing session metadata (re-appended)
titles("Run the tests one more time.")
meta({"type": "agent-name", "agentName": "Add a word-count CLI to demo project", "sessionId": SID})
meta({"type": "cost-state", "sessionId": SID, "totalCostUSD": 0.4213, "totalAPIDuration": 61234, "totalAPIDurationWithoutRetries": 60111, "totalToolDuration": 8123,
      "totalLinesAdded": 3, "totalLinesRemoved": 1, "totalDuration": 1800000, "startTime": int(BASE.timestamp() * 1000),
      "modelUsage": {"claude-opus-5-5": {"inputTokens": 61, "outputTokens": 1957, "thinkingTokens": 480, "cacheReadInputTokens": 360000, "cacheCreationInputTokens": 24000, "webSearchRequests": 1, "costUSD": 0.4201},
                     "claude-haiku-5-5": {"inputTokens": 900, "outputTokens": 40, "thinkingTokens": 0, "cacheReadInputTokens": 0, "cacheCreationInputTokens": 0, "webSearchRequests": 0, "costUSD": 0.0012}},
      "hasUnknownModelCost": False})
meta({"type": "continued-in", "timestamp": ts(), "sessionId": SID, "continuedInSessionId": "5e55a0de-0000-4000-8000-000000000002"})
meta({"type": "last-prompt", "leafUuid": last[0], "sessionId": SID})

with open(os.path.join(OUT, "synthetic-session.jsonl"), "w") as f:
    for d in lines: f.write(json.dumps(d, ensure_ascii=False, separators=(",", ":")) + "\n")
main_count = len(lines)

# ================================================================ subagent transcript
sub = []
SUBDIR = os.path.join(OUT, "synthetic-session", "subagents"); os.makedirs(SUBDIR, exist_ok=True)
def subrec(d, parent):
    d2 = {"parentUuid": parent, "isSidechain": True, "agentId": AGENT_ID}
    d2.update(d)
    d2.setdefault("uuid", U()); d2.setdefault("timestamp", ts())
    d2.update({"userType": "external", "entrypoint": "cli", "cwd": CWD, "sessionId": SID, "version": VER, "gitBranch": "main"})
    sub.append(d2); return d2
r = subrec({"type": "user", "message": {"role": "user", "content": "Review src/cli.py for bugs. (placeholder prompt)"}}, None)
r = subrec({"type": "user", "message": {"role": "user", "content": "<system-reminder>\nYour final report is delivered through SubagentHandback.\n</system-reminder>"}, "isMeta": True}, r["uuid"])
r = subrec({"type": "attachment", "attachment": {"type": "date", "date": "2026-10-20"}, "rendered": [{"content": "<system-reminder>\nToday's date is 2026-10-20.\n</system-reminder>"}], "renderedRole": "system"}, r["uuid"])
r = subrec({"type": "attachment", "attachment": {"type": "instructions", "files": [{"path": CWD + "/CLAUDE.md", "type": "Project", "content": "(placeholder project instructions)"}]}, "rendered": [{"content": "<system-reminder>\nCodebase and user instructions are shown below. (placeholder)\n</system-reminder>"}], "renderedRole": "user"}, r["uuid"])
def sub_asst(block, parent, stop, out):
    _m[0] += 1
    return subrec({"type": "assistant", "requestId": RID(), "apiBlockIndex": 0, "effort": "high", "attributionAgent": "general-purpose",
                   "message": {"model": "claude-opus-5-5", "id": MID(), "type": "message", "role": "assistant", "content": [block], "container": None, "stop_reason": stop, "stop_sequence": None, "stop_details": None,
                               "usage": USAGE0(3, 9000, 800, out), "diagnostics": None, "context_management": None, "input_transformations": []}}, parent)
b = tu("Bash", {"command": "cat src/cli.py", "description": "Show cli source"})
r = sub_asst(b, r["uuid"], "tool_use", 40)
r = subrec({"type": "user", "message": {"role": "user", "content": [{"tool_use_id": b["id"], "type": "tool_result", "content": "import sys\n...", "is_error": False}]},
            "toolUseResult": {"stdout": "import sys\n...", "stderr": "", "interrupted": False, "isImage": False, "noOutputExpected": False}, "sourceToolAssistantUUID": r["uuid"]}, r["uuid"])
b2 = tu("SubagentHandback", {"message": "No bugs found. (placeholder report)"})
asst2 = sub_asst(b2, r["uuid"], "tool_use", 60)
subrec({"type": "user", "message": {"role": "user", "content": [{"tool_use_id": b2["id"], "type": "tool_result", "content": [{"type": "text", "text": "{\"success\":true,\"message\":\"Report delivered to your caller.\"}"}]}]},
        "toolUseResult": {"success": True, "message": "Report delivered to your caller."}, "sourceToolAssistantUUID": asst2["uuid"]}, asst2["uuid"])
with open(os.path.join(SUBDIR, "agent-%s.jsonl" % AGENT_ID), "w") as f:
    for d in sub: f.write(json.dumps(d, ensure_ascii=False, separators=(",", ":")) + "\n")
with open(os.path.join(SUBDIR, "agent-%s.meta.json" % AGENT_ID), "w") as f:
    json.dump({"agentType": "general-purpose", "description": "Review word-count change", "toolUseId": AGENT_TOOL_ID, "model": "opus", "spawnDepth": 1, "requestShape": "background", "requestNonInteractive": True}, f)

# ================================================================ /btw fork transcript
FORK_ID = "awhat-is-wc-5e55a0de00000001"
fork = [{"type": "fork-context-ref", "agentId": FORK_ID, "parentSessionId": SID, "parentLastUuid": FORK_PARENT_LAST, "contextLength": 42}]
def frec(d, parent):
    d2 = {"parentUuid": parent, "isSidechain": True, "agentId": FORK_ID}; d2.update(d)
    d2.setdefault("uuid", U()); d2.setdefault("timestamp", ts())
    d2.update({"userType": "external", "entrypoint": "cli", "cwd": CWD, "sessionId": SID, "version": VER, "gitBranch": "main"})
    fork.append(d2); return d2
r = frec({"type": "user", "message": {"role": "user", "content": "what does wc stand for?"}, "promptId": "5e55a0de-9000-4000-8000-000000000011"}, None)
r = frec({"type": "assistant", "message": {"id": "5e55a0de-f0f0-4000-8000-000000000001", "model": "<synthetic>", "role": "assistant", "type": "message", "stop_reason": "stop_sequence", "stop_sequence": "", "container": None, "stop_details": None, "diagnostics": None,
          "usage": {"input_tokens": 0, "output_tokens": 0, "cache_creation_input_tokens": 0, "cache_read_input_tokens": 0}, "content": [text("(placeholder: answer shown inline in the parent UI)")]}}, r["uuid"])
r = frec({"type": "user", "message": {"role": "user", "content": [{"type": "text", "text": "<fork-boilerplate>\nYou are a worker fork. (placeholder)\n</fork-boilerplate>"}]}}, r["uuid"])
_m[0] += 1
r = frec({"type": "assistant", "requestId": RID(), "apiBlockIndex": 0, "thinkingDurationMs": 300, "message": {"model": "claude-opus-5-5", "id": MID(), "type": "message", "role": "assistant", "content": [think("")], "container": None, "stop_reason": None, "stop_sequence": None, "stop_details": None, "usage": USAGE0(3, 5000, 100, 8), "diagnostics": None, "context_management": None, "input_transformations": []}}, r["uuid"])
r = frec({"type": "assistant", "requestId": RID(), "apiBlockIndex": 1, "message": {"model": "claude-opus-5-5", "id": MID(), "type": "message", "role": "assistant", "content": [text("wc stands for \"word count\".")], "container": None, "stop_reason": "end_turn", "stop_sequence": None, "stop_details": None, "usage": USAGE0(3, 5000, 100, 25), "diagnostics": None, "context_management": None, "input_transformations": []}}, r["uuid"])
fork[-1]["message"]["id"] = fork[-2]["message"]["id"]  # same API message split over two records
with open(os.path.join(SUBDIR, "agent-%s.jsonl" % FORK_ID), "w") as f:
    for d in fork: f.write(json.dumps(d, ensure_ascii=False, separators=(",", ":")) + "\n")
with open(os.path.join(SUBDIR, "agent-%s.meta.json" % FORK_ID), "w") as f:
    json.dump({"agentType": "fork", "description": "what does wc stand for?", "toolUseId": None, "spawnDepth": 1, "requestShape": "background", "requestNonInteractive": False, "isFork": True, "name": "what-is-wc"}, f)
print("main lines", main_count, "subagent lines", len(sub), "fork lines", len(fork))
