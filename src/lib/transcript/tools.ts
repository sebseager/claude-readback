// One-line summaries and icon categories for tool calls.
import { arr, compactJson, isObj, str, truncate } from './util'

export type ToolCategory =
  'shell' | 'file-read' | 'file-write' | 'search' | 'web' | 'agent' | 'ask' | 'todo' | 'mcp' | 'other'

const CATEGORY: Record<string, ToolCategory> = {
  Bash: 'shell',
  BashOutput: 'shell',
  KillShell: 'shell',
  Monitor: 'shell',
  Read: 'file-read',
  NotebookRead: 'file-read',
  Edit: 'file-write',
  MultiEdit: 'file-write',
  Write: 'file-write',
  NotebookEdit: 'file-write',
  Grep: 'search',
  Glob: 'search',
  LS: 'search',
  ToolSearch: 'search',
  WebFetch: 'web',
  WebSearch: 'web',
  Agent: 'agent',
  Task: 'agent',
  SendMessage: 'agent',
  SubagentHandback: 'agent',
  ListAgents: 'agent',
  TaskStop: 'agent',
  Workflow: 'agent',
  AskUserQuestion: 'ask',
  TodoWrite: 'todo',
  TaskCreate: 'todo',
  TaskUpdate: 'todo',
  TaskList: 'todo',
}

export function toolCategory(name: string): ToolCategory {
  if (name.startsWith('mcp__')) return 'mcp'
  return CATEGORY[name] ?? 'other'
}

/** `Task` is the older name of `Agent`. */
export const isAgentTool = (name: string): boolean => name === 'Agent' || name === 'Task'

const MAX = 80

const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim()

/** One-line human summary of a tool call input (DESIGN.md "tool card header"). */
export function summarizeTool(name: string, input: unknown): string {
  const i = isObj(input) ? input : {}
  const s = (k: string) => str(i[k])
  const n = (k: string) => arr(i[k])?.length
  let out: string | undefined
  switch (name) {
    case 'Bash':
      out = s('description') || s('command')
      break
    case 'Read':
    case 'Edit':
    case 'Write':
    case 'MultiEdit':
      out = s('file_path') ?? s('path')
      break
    case 'NotebookEdit':
    case 'NotebookRead':
      out = s('notebook_path')
      break
    case 'Grep': {
      const pattern = s('pattern')
      const path = s('path') ?? s('glob')
      out = pattern !== undefined ? (path ? `${pattern} in ${path}` : pattern) : undefined
      break
    }
    case 'Glob': {
      const pattern = s('pattern')
      const path = s('path')
      out = pattern !== undefined ? (path ? `${pattern} in ${path}` : pattern) : undefined
      break
    }
    case 'LS':
      out = s('path')
      break
    case 'Agent':
    case 'Task':
      out = s('description') ?? s('prompt')
      break
    case 'WebFetch':
      out = s('url')
      break
    case 'WebSearch':
      out = s('query')
      break
    case 'AskUserQuestion': {
      const q = n('questions')
      out = q !== undefined ? `${q} question${q === 1 ? '' : 's'}` : undefined
      break
    }
    case 'TodoWrite': {
      const t = n('todos')
      out = t !== undefined ? `${t} todo${t === 1 ? '' : 's'}` : undefined
      break
    }
    case 'Skill':
      out = s('skill') ?? s('name') ?? s('command')
      break
    case 'ToolSearch':
      out = s('query')
      break
    case 'SendMessage':
      out = s('to') ? `to ${s('to')}${s('message') ? `: ${s('message')}` : ''}` : undefined
      break
    case 'SubagentHandback':
      out = s('message')
      break
    case 'Monitor':
      out = s('description') ?? s('command')
      break
    case 'TaskStop':
      out = s('task_id') ?? s('taskId')
      break
    case 'Workflow':
      out = s('workflowName') ?? s('name') ?? s('description')
      break
    case 'StructuredOutput':
      out = 'structured output'
      break
  }
  if (out !== undefined && out.trim() !== '') return truncate(oneLine(out), MAX)
  if (input === undefined || (isObj(input) && Object.keys(input).length === 0)) return ''
  return compactJson(input, MAX)
}

/** "mcp__github__create_issue" → "github · create_issue" (the tool card header; also what search indexes). */
export function displayToolName(name: string): string {
  if (!name.startsWith('mcp__')) return name
  const [, server, ...rest] = name.split('__')
  return rest.length ? `${server} · ${rest.join('__')}` : name
}
