import {
  Bot,
  FilePen,
  FileText,
  Globe,
  ListChecks,
  MessageCircleQuestion,
  Search,
  Terminal,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import type { ToolBlock, ToolResult } from '@/lib/transcript/types'

const ICONS: Record<string, LucideIcon> = {
  Bash: Terminal,
  BashOutput: Terminal,
  Monitor: Terminal,
  Read: FileText,
  Edit: FilePen,
  MultiEdit: FilePen,
  Write: FilePen,
  NotebookEdit: FilePen,
  Grep: Search,
  Glob: Search,
  ToolSearch: Search,
  WebSearch: Globe,
  WebFetch: Globe,
  Agent: Bot,
  Task: Bot,
  SendMessage: Bot,
  SubagentHandback: Bot,
  AskUserQuestion: MessageCircleQuestion,
  TodoWrite: ListChecks,
  TaskCreate: ListChecks,
  TaskUpdate: ListChecks,
}

export function toolIcon(name: string): LucideIcon {
  return ICONS[name] ?? Wrench
}

export { displayToolName } from '@/lib/transcript/tools'

export type ToolStatus = 'success' | 'error' | 'denied' | 'pending'

export function toolStatus(block: ToolBlock): ToolStatus {
  const r = block.result
  if (!r) return 'pending'
  if (r.denied) return 'denied'
  if (r.isError) return 'error'
  return 'success'
}

/** Text the model saw, joined. */
export function resultText(result: ToolResult | undefined): string {
  if (!result) return ''
  return result.content.flatMap((c) => (c.type === 'text' ? [c.text] : [])).join('\n')
}
