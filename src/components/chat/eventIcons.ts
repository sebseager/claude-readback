import {
  Ban,
  CalendarDays,
  Circle,
  History,
  Info,
  ListTodo,
  Repeat,
  ShieldAlert,
  SquareTerminal,
  Stethoscope,
  Timer,
  TriangleAlert,
  Webhook,
  type LucideIcon,
} from 'lucide-react'
import type { EventItem } from '@/lib/transcript/types'

export const EVENT_ICONS: Record<EventItem['category'], LucideIcon> = {
  'turn-duration': Timer,
  hook: Webhook,
  interrupt: Ban,
  'api-error': TriangleAlert,
  'model-fallback': Repeat,
  recap: History,
  'date-change': CalendarDays,
  diagnostics: Stethoscope,
  'task-status': ListTodo,
  'local-command': SquareTerminal,
  permission: ShieldAlert,
  informational: Info,
  other: Circle,
}
