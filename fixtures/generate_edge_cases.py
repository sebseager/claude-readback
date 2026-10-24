#!/usr/bin/env python3
"""Write fixtures/edge-cases.jsonl: synthetic edge cases for the fold (all content invented).

Usage: python3 fixtures/generate_edge_cases.py fixtures/
Each scenario is tagged in a comment below; src/lib/transcript/edge-cases.test.ts asserts on them.
"""
import json
import sys

SID = "ed9e0000-0000-4000-8000-000000000001"
lines = []
T = [0]


def ts():
    T[0] += 1
    return "2026-10-21T10:%02d:%02d.000Z" % (T[0] // 60, T[0] % 60)


def u(n):
    return "ed9e0000-0000-4000-9000-%012d" % n


def env(uuid, parent, **kw):
    r = {"parentUuid": parent, "isSidechain": False, "uuid": uuid, "timestamp": ts(), "sessionId": SID,
         "cwd": "/home/dev/edge", "version": "2.1.235", "gitBranch": "feature/x", "entrypoint": "cli", "userType": "external"}
    r.update(kw)
    return r


def emit(r):
    lines.append(json.dumps(r, separators=(",", ":")) if not isinstance(r, str) else r)


def user(uuid, parent, content, **kw):
    emit(env(uuid, parent, type="user", message={"role": "user", "content": content}, **kw))


def asst(uuid, parent, mid, block, stop=None, out=8, idx=None, usage=True, model="claude-sonnet-5-5", **kw):
    msg = {"model": model, "id": mid, "type": "message", "role": "assistant", "content": [block], "stop_reason": stop}
    if usage:
        msg["usage"] = {"input_tokens": 10, "cache_creation_input_tokens": 100, "cache_read_input_tokens": 1000,
                        "output_tokens": out, "cache_creation": {"ephemeral_1h_input_tokens": 100, "ephemeral_5m_input_tokens": 0}}
    r = env(uuid, parent, type="assistant", message=msg, requestId="req_" + mid, **kw)
    if idx is not None:
        r["apiBlockIndex"] = idx
    emit(r)


def tool_result(uuid, parent, tool_id, content, src=None, **kw):
    r = {"type": "tool_result", "tool_use_id": tool_id, "content": content}
    user(uuid, parent, [r], sourceToolAssistantUUID=src, **kw)


# 0-2: metadata, a blank line and an invalid line
emit({"type": "permission-mode", "permissionMode": "default", "sessionId": SID})
emit("")
emit("{this is not json")

# 3: [paste] two pastes in one prompt, the second closed with a plain </pasted_content>, plus an inline system-reminder
p1 = ("Compare these two logs.\n<pasted_content id=\"b0b0\">\nalpha one\nalpha two\n</pasted_content id=\"b0b0\">\n"
      "and\n<pasted_content id=\"c1c1\">\nbeta one\nbeta two\nbeta three\n</pasted_content>\n"
      "<system-reminder>inline reminder text</system-reminder>")
user(u(1), None, p1, promptId="ed9e-p1")

# 4-10: [parallel] one API message with three tool calls; results interleaved and out of order (2.1.283+ shape)
asst(u(2), u(1), "msg_par", {"type": "tool_use", "id": "toolu_par_a", "name": "Read", "input": {"file_path": "/home/dev/edge/a.txt"}}, idx=0)
asst(u(3), u(2), "msg_par", {"type": "tool_use", "id": "toolu_par_b", "name": "Grep", "input": {"pattern": "needle", "path": "src"}}, idx=1)
tool_result(u(5), u(2), "toolu_par_a", "contents of a", src=u(2), promptId="ed9e-p1")
asst(u(4), u(3), "msg_par", {"type": "tool_use", "id": "toolu_par_c", "name": "Glob", "input": {"pattern": "**/*.md"}}, idx=2, stop="tool_use", out=77)
tool_result(u(7), u(4), "toolu_par_c", "README.md", src=u(4), promptId="ed9e-p1")
tool_result(u(6), u(3), "toolu_par_b", [{"type": "text", "text": "src/x.ts:1:needle"}], src=u(3), promptId="ed9e-p1")
# [missing-optional] an attachment with no rendered, no timestamp
r = env(u(8), u(7), type="attachment", attachment={"type": "mystery_attachment", "foo": 1})
del r["timestamp"]
emit(r)

# 11-13: [linear] 2.1.235 shape: no apiBlockIndex, every record final; unknown block type + redacted_thinking
asst(u(9), u(8), "msg_lin", {"type": "redacted_thinking", "data": "opaque"}, stop="end_turn", out=40)
asst(u(10), u(9), "msg_lin", {"type": "server_tool_use", "id": "srvtoolu_1", "name": "web_search", "input": {"query": "q"}}, stop="end_turn", out=40)
asst(u(11), u(10), "msg_lin", {"type": "text", "text": "Both logs mention **needle**."}, stop="end_turn", out=40)

# 14: [orphan] a tool_result whose call does not exist
tool_result(u(12), u(11), "toolu_missing", "nobody asked", promptId="ed9e-p1")

# 15: [src-fallback] a tool call whose result has the wrong tool_use_id but the right sourceToolAssistantUUID
asst(u(13), u(12), "msg_src", {"type": "tool_use", "id": "toolu_src", "name": "Bash", "input": {"command": "ls"}}, stop="tool_use", out=12)
tool_result(u(14), u(13), "toolu_mangled", "a b c", src=u(13), promptId="ed9e-p1")

# 17-18: [unknown] unknown system subtype and unknown record type with a uuid
emit(env(u(15), u(14), type="system", subtype="brand_new_subtype", content="something new", level="warning"))
emit(env(u(16), u(15), type="mystery", payload=1))

# 19-23: [rewind] prompt A + answer, then the user rewinds and sends prompt B with the same parent
user(u(20), u(16), "Prompt A (will be abandoned)", promptId="ed9e-pA")
asst(u(21), u(20), "msg_A", {"type": "text", "text": "answer to A"}, stop="end_turn", out=5)
user(u(22), u(21), "Follow-up on A (also abandoned)", promptId="ed9e-pA2")
asst(u(23), u(22), "msg_A2", {"type": "text", "text": "answer to A2"}, stop="end_turn", out=5)
user(u(30), u(16), "Prompt B (the edited version)", promptId="ed9e-pB")

# 24-25: [duplicate] a record copied with the same uuid (continued-in copy); the first one wins
asst(u(31), u(30), "msg_B", {"type": "text", "text": "answer to B"}, stop="end_turn", out=6)
asst(u(31), u(30), "msg_B_copy", {"type": "text", "text": "DUPLICATE SHOULD NOT RENDER"}, stop="end_turn", out=6)

# 26: [meta-turn] isMeta string with a new promptId opens a meta turn
user(u(32), u(31), "[SYSTEM NOTIFICATION - NOT USER INPUT] a background job finished", isMeta=True, promptId="ed9e-pM")
asst(u(33), u(32), "msg_M", {"type": "text", "text": "noted"}, usage=False)

# 28-29: [bash-mode] ! command and its output
user(u(34), u(33), "<bash-input>git status</bash-input>", promptId="ed9e-pBash")
user(u(35), u(34), "<bash-stdout>On branch feature/x</bash-stdout><bash-stderr></bash-stderr>", promptId="ed9e-pBash")

# 30-31: [queued-paste] a queued message containing a paste, delivered mid-turn
user(u(36), u(35), "Prompt C", promptId="ed9e-pC")
emit(env(u(37), u(36), type="attachment",
         attachment={"type": "queued_command", "prompt": "also this\n<pasted_content id=\"d2d2\">\nq1\nq2\n</pasted_content id=\"d2d2\">",
                     "commandMode": "prompt", "origin": {"kind": "human"}}))

# 32-33: [task-alias] legacy Task tool with a synchronous completed result
asst(u(38), u(37), "msg_task", {"type": "tool_use", "id": "toolu_task", "name": "Task", "input": {"description": "Legacy task", "prompt": "do it", "subagent_type": "Explore"}}, stop="tool_use", out=9)
emit(env(u(39), u(38), type="user", message={"role": "user", "content": [{"type": "tool_result", "tool_use_id": "toolu_task", "content": [{"type": "text", "text": "done"}]}]},
         toolUseResult={"status": "completed", "agentId": "alegacy0001", "content": [{"type": "text", "text": "Legacy report."}], "totalDurationMs": 1000},
         sourceToolAssistantUUID=u(38)))

# 34: [shutdown] interrupted by shutdown
user(u(40), u(39), [{"type": "text", "text": "[Request interrupted by user]"}], interruptedByShutdown=True, promptId="ed9e-pC")

# 35: [compact-no-boundary] a compact summary without a preceding boundary
user(u(41), u(40), "This session is being continued from a previous conversation. (placeholder)", isCompactSummary=True, isVisibleInTranscriptOnly=True)

# 36: [last-prompt] trailing metadata, then a partial last line
emit({"type": "last-prompt", "lastPrompt": "Prompt C", "leafUuid": u(41), "sessionId": SID})
lines.append('{"parentUuid":"' + u(41) + '","type":"user","message":{"role":"user","cont')

out = (sys.argv[1] if len(sys.argv) > 1 else "fixtures") + "/edge-cases.jsonl"
with open(out, "w") as f:
    f.write("\n".join(lines))  # no trailing newline: the last line is partial on purpose
print(out, len(lines), "lines")
