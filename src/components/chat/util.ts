// Small pure helpers shared by chat components.
import type { PromptSegment, Turn } from '@/lib/transcript/types'

/** Visible prose of prompt segments: the text segments, joined. */
export function segmentsText(segments: readonly PromptSegment[]): string {
  return segments
    .flatMap((s) => (s.kind === 'text' ? [s.text] : []))
    .join('\n')
    .trim()
}

/** Visible prose of a prompt: its text segments, joined. */
export function promptText(turn: Turn): string {
  return segmentsText(turn.prompt?.segments ?? [])
}

export type BodyPart =
  { kind: 'text'; text: string } | { kind: 'pasted'; id: string; index: number; lines: number; text: string }

/** Whitespace a chip replaces: a line break if there was one, else a space, else nothing. */
const edge = (ws: string) => (ws.includes('\n') ? '\n' : ws ? ' ' : '')

/**
 * What the bubble shows, in order: prose with pasted blocks as inline chips where they were pasted.
 * Whitespace around a chip collapses to one line break (or one space); the ends are trimmed. Other
 * segment kinds (images, documents, reminders) are chips above the bubble and are skipped here.
 */
export function promptBody(segments: readonly PromptSegment[]): BodyPart[] {
  const inline = segments.filter((s) => s.kind === 'text' || s.kind === 'pasted')
  const out: BodyPart[] = []
  inline.forEach((s, i) => {
    if (s.kind === 'pasted') {
      out.push(s)
      return
    }
    let text = s.text
    const first = i === 0
    const last = i === inline.length - 1
    const lead = /^\s*/.exec(text)![0]
    const trail = /\s*$/.exec(text)![0]
    const core = text.slice(lead.length, Math.max(lead.length, text.length - trail.length))
    if (core.length === 0) {
      const sep = first || last ? '' : edge(text)
      if (sep) out.push({ kind: 'text', text: sep })
      return
    }
    text = (first ? '' : edge(lead)) + core + (last ? '' : edge(trail))
    out.push({ kind: 'text', text })
  })
  return out
}

/** True when the bubble has something to show: prose or a pasted block. */
export const hasPromptBody = (segments: readonly PromptSegment[]) =>
  segments.some((s) => s.kind === 'pasted' || (s.kind === 'text' && s.text.trim().length > 0))

export const dataUrl = (mediaType: string, base64: string) => `data:${mediaType};base64,${base64}`

/** Inner text of the first `<tag>…</tag>` in `text`. */
export function tagContent(text: string, tag: string): string | undefined {
  const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(text)
  return m ? m[1].trim() : undefined
}

/** First line of `text`, with light markdown (emphasis, code ticks, heading marks) stripped. */
export function firstLine(text: string, max = 140): string {
  const line = (text.trim().split('\n', 1)[0] ?? '').replace(/^#+\s+/, '').replace(/(\*\*|__|`)/g, '')
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

// ---- unknown-shape guards for tool inputs/results -------------------------------------------------

export type Rec = Record<string, unknown>

export const asRecord = (v: unknown): Rec | undefined =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : undefined
export const asString = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
export const asNumber = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined
export const asBool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined)
export const asArray = (v: unknown): unknown[] | undefined => (Array.isArray(v) ? v : undefined)

export function prettyJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2) ?? String(v)
  } catch {
    return String(v)
  }
}
