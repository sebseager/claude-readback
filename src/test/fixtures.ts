// Synthetic fixtures (fixtures/*), loaded as raw strings through Vite so tests need no node:fs.
import mainText from '../../fixtures/synthetic-session.jsonl?raw'
import agentText from '../../fixtures/synthetic-session/subagents/agent-a5e55a0de00000001.jsonl?raw'
import agentMetaText from '../../fixtures/synthetic-session/subagents/agent-a5e55a0de00000001.meta.json?raw'
import forkText from '../../fixtures/synthetic-session/subagents/agent-awhat-is-wc-5e55a0de00000001.jsonl?raw'
import forkMetaText from '../../fixtures/synthetic-session/subagents/agent-awhat-is-wc-5e55a0de00000001.meta.json?raw'
import edgeText from '../../fixtures/edge-cases.jsonl?raw'

export const SYNTHETIC_SESSION_ID = '5e55a0de-0000-4000-8000-000000000001'
export const SUBAGENT_ID = 'a5e55a0de00000001'
export const FORK_ID = 'awhat-is-wc-5e55a0de00000001'

export const fixtures = {
  main: { name: 'synthetic-session.jsonl', text: mainText },
  agent: { name: `synthetic-session/subagents/agent-${SUBAGENT_ID}.jsonl`, text: agentText },
  agentMeta: { name: `synthetic-session/subagents/agent-${SUBAGENT_ID}.meta.json`, text: agentMetaText },
  fork: { name: `synthetic-session/subagents/agent-${FORK_ID}.jsonl`, text: forkText },
  forkMeta: { name: `synthetic-session/subagents/agent-${FORK_ID}.meta.json`, text: forkMetaText },
  edge: { name: 'edge-cases.jsonl', text: edgeText },
}

/** All synthetic-session files, in the order a user might drop them. */
export const allSyntheticFiles = () => [
  fixtures.main,
  fixtures.agent,
  fixtures.agentMeta,
  fixtures.fork,
  fixtures.forkMeta,
]
