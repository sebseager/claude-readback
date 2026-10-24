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
