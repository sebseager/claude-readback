import type { Session } from '@/lib/transcript/types'

/** How the UI names `session.turns[index]`: "turn 3" (human prompts, 1-based), "/btw", "agent message"… */
export function describeTurn(session: Session, index: number): string {
  const t = session.turns[index]
  if (!t) return `turn ${index + 1}`
  switch (t.kind) {
    case 'human': {
      let n = 0
      for (let i = 0; i <= index; i++) if (session.turns[i].kind === 'human') n++
      return `turn ${n}`
    }
    case 'slash-command': {
      const name = t.prompt?.command?.name
      return name ? (name.startsWith('/') ? name : `/${name}`) : 'command'
    }
    case 'task-notification':
      return 'task notification'
    case 'agent-message':
      return 'agent message'
    case 'compact-summary':
      return 'compact summary'
    case 'meta':
      return 'context'
  }
}
