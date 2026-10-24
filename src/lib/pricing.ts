// Per-million-token list prices (USD, Anthropic first-party API) for estimating session cost.
// Source: the claude-api skill's model table (cached 2026-10-06). Cache writes are 1.25x input for
// the 5-minute TTL and 2x for the 1-hour TTL; cache reads are 0.1x input except where noted.
// Entries marked UNVERIFIED are older models priced from memory.
import type { Usage } from './transcript/types'

export interface ModelPrice {
  input: number
  output: number
  cacheRead: number
  /** 5-minute cache write. */
  cacheWrite5m: number
  /** 1-hour cache write. */
  cacheWrite1h: number
  /** Prices above this prompt size (input + cache tokens) use `longContext`. */
  longContextThreshold?: number
  longContext?: { input: number; output: number }
}

const p = (input: number, output: number, cacheRead = input * 0.1): ModelPrice => ({
  input,
  output,
  cacheRead,
  cacheWrite5m: input * 1.25,
  cacheWrite1h: input * 2,
})

/** Keys are model-id prefixes; the longest matching prefix wins. */
export const PRICES: Record<string, ModelPrice> = {
  'claude-fable-5-1': p(10, 50, 0.25),
  'claude-mythos-5-1': p(10, 50, 0.25),
  'claude-fable-5': p(10, 50, 1),
  'claude-mythos-5': p(10, 50, 1),
  'claude-opus-5-5': p(4, 20, 0.2),
  'claude-opus-5': p(5, 25),
  'claude-opus-4-8': p(5, 25),
  'claude-opus-4-7': p(5, 25),
  'claude-opus-4-6': p(5, 25),
  'claude-opus-4-5': p(5, 25), // UNVERIFIED
  'claude-opus-4-1': p(15, 75), // UNVERIFIED
  'claude-opus-4': p(15, 75), // UNVERIFIED
  'claude-sonnet-5-5': p(2, 10, 0.2),
  'claude-sonnet-5': p(2, 10),
  'claude-sonnet-4-6': p(3, 15),
  'claude-sonnet-4-5': p(3, 15), // UNVERIFIED
  'claude-sonnet-4': p(3, 15), // UNVERIFIED
  'claude-haiku-5-5': {
    ...p(0.1, 0.5),
    longContextThreshold: 100_000,
    longContext: { input: 0.5, output: 2.5 },
  },
  'claude-haiku-4-5': p(1, 5),
  'claude-3-7-sonnet': p(3, 15), // UNVERIFIED
  'claude-3-5-haiku': p(0.8, 4), // UNVERIFIED
}

const KEYS = Object.keys(PRICES).sort((a, b) => b.length - a.length)

/** Normalise provider prefixes and suffixes: `us.anthropic.claude-opus-5-5[1m]` → `claude-opus-5-5`. */
export function normalizeModelId(model: string): string {
  let m = model.trim().toLowerCase()
  const at = m.indexOf('claude-')
  if (at > 0) m = m.slice(at)
  const bracket = m.indexOf('[')
  if (bracket >= 0) m = m.slice(0, bracket)
  return m.replace(/@.*$/, '')
}

export function priceFor(model: string): ModelPrice | undefined {
  const m = normalizeModelId(model)
  for (const k of KEYS) {
    if (m === k || m.startsWith(`${k}-`) || m.startsWith(k)) return PRICES[k]
  }
  return undefined
}

export interface PricedUsage extends Pick<
  Usage,
  'inputTokens' | 'cacheReadTokens' | 'cacheWriteTokens' | 'outputTokens'
> {
  /** Portion of cacheWriteTokens written with the 1-hour TTL (priced at 2x instead of 1.25x). */
  cacheWrite1hTokens?: number
}

/** Estimated cost of one API message (or summed usage of one model). Undefined for unknown models. */
export function estimateCostUsd(model: string, usage: PricedUsage): number | undefined {
  const price = priceFor(model)
  if (!price) return undefined
  const promptTokens = usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
  const long =
    price.longContext && price.longContextThreshold !== undefined && promptTokens > price.longContextThreshold
  const inRate = long && price.longContext ? price.longContext.input : price.input
  const outRate = long && price.longContext ? price.longContext.output : price.output
  const scale = inRate / price.input
  const w1h = Math.min(usage.cacheWrite1hTokens ?? 0, usage.cacheWriteTokens)
  const w5m = usage.cacheWriteTokens - w1h
  const usd =
    usage.inputTokens * inRate +
    usage.outputTokens * outRate +
    usage.cacheReadTokens * price.cacheRead * scale +
    w5m * price.cacheWrite5m * scale +
    w1h * price.cacheWrite1h * scale
  return usd / 1_000_000
}
