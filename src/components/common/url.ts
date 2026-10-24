/**
 * Transcript content is untrusted (people share JSONL files): only http(s) URLs may become clickable.
 * Returns the normalized href for absolute http:/https: URLs, else undefined (javascript:, data:, relative…).
 */
export function safeHref(u: unknown): string | undefined {
  if (typeof u !== 'string' || !u.trim()) return undefined
  try {
    const p = new URL(u.trim())
    return p.protocol === 'http:' || p.protocol === 'https:' ? p.href : undefined
  } catch {
    return undefined
  }
}
