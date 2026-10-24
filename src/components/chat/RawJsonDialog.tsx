import { useMemo } from 'react'
import type { RawRecord } from '@/lib/transcript/types'
import { TextViewerDialog } from './TextViewerDialog'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 0-based lines in the main file, resolved through `getRaw`. */
  lines?: number[]
  getRaw?: (line: number) => RawRecord | undefined
  /** Records already at hand (abandoned branches). Shown after the resolved lines. */
  records?: RawRecord[]
  title?: string
}

/** Pretty-printed original JSONL record(s) of a row or card. */
export function RawJsonDialog({
  open,
  onOpenChange,
  lines = [],
  getRaw,
  records = [],
  title = 'Raw JSON',
}: Props) {
  const text = useMemo(() => {
    if (!open) return ''
    const found: RawRecord[] = []
    const missing: number[] = []
    for (const l of lines) {
      const r = getRaw?.(l)
      if (r) found.push(r)
      else missing.push(l)
    }
    const all = [...found, ...records]
    const body = all.map((r) => JSON.stringify(r, rawReplacer, 2)).join('\n\n')
    const note = missing.length
      ? `// Not available: line${missing.length > 1 ? 's' : ''} ${missing.map((l) => l + 1).join(', ')}\n`
      : ''
    return note + (body || '// No raw records')
  }, [open, lines, getRaw, records])
  const count = lines.length + records.length
  const lineList = lines.length
    ? ` · line${lines.length > 1 ? 's' : ''} ${lines.map((l) => l + 1).join(', ')}`
    : ''
  return (
    <TextViewerDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={`${count} record${count === 1 ? '' : 's'}${lineList}`}
      text={text}
    />
  )
}

/** Strings above this are cut in the raw view (the stored file keeps them; Export JSONL has everything). */
const MAX_RAW_STRING = 100_000
const BASE64ISH = /^[A-Za-z0-9+/=\s]+$/

const kb = (n: number) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`)

/** Elides image/PDF payloads and cuts giant strings so a multi-MB record stays cheap to show. */
function rawReplacer(key: string, value: unknown): unknown {
  if (typeof value !== 'string' || value.length < 2_000) return value
  if ((key === 'data' || key === 'base64') && BASE64ISH.test(value.slice(0, 2_000)))
    return `[base64, ${kb(value.length)} omitted]`
  if (value.length > MAX_RAW_STRING)
    return `${value.slice(0, MAX_RAW_STRING)}… [${kb(value.length - MAX_RAW_STRING)} more omitted — use Export JSONL for the full record]`
  return value
}
