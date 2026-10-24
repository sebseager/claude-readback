// Turning picked / dropped browser files into ingest batches: accepted extensions, relative paths of files
// found inside dropped directories, and grouping into per-session batches (for progress reporting).

/** Relative paths of files collected from dropped directories (`File.webkitRelativePath` is empty there). */
const droppedPaths = new WeakMap<File, string>()

/** Attach a relative path to a File (directory drops; tests). */
export function setFilePath(file: File, path: string): File {
  droppedPaths.set(file, path)
  return file
}

/** Best path for a file: dropped-directory path, picker-directory path, else its name. */
export function pathOf(file: File): string {
  return droppedPaths.get(file) ?? (file.webkitRelativePath || file.name)
}

/** Transcripts and subagent metadata. Everything else in a project folder (tool-results, memory…) is skipped. */
export function isAcceptedName(name: string): boolean {
  const n = name.toLowerCase()
  return n.endsWith('.jsonl') || n.endsWith('.meta.json')
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

/**
 * Session a path most likely belongs to, for batching only (the worker classifies for real): the last
 * UUID-looking path segment that is a folder or a `<uuid>.jsonl` stem. Files without one share a batch.
 */
export function batchKeyOf(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/')
  for (let i = parts.length - 1; i >= 0; i--) {
    const seg = i === parts.length - 1 ? parts[i].replace(/\.jsonl$/i, '') : parts[i]
    const m = UUID.exec(seg)
    if (m && m[0].length === seg.length) return m[0].toLowerCase()
  }
  return ''
}

/**
 * Split files into batches of whole sessions (main + its subagents travel together) with at most
 * `maxBytes` per batch where possible. Unkeyed files go in the last batch so their parents land first.
 */
export function batchFiles<T extends { path: string; size: number }>(files: T[], maxBytes = 48 << 20): T[][] {
  const groups = new Map<string, T[]>()
  for (const f of files) {
    const k = batchKeyOf(f.path)
    const list = groups.get(k)
    if (list) list.push(f)
    else groups.set(k, [f])
  }
  const loose = groups.get('') ?? []
  groups.delete('')
  const batches: T[][] = []
  let cur: T[] = []
  let bytes = 0
  for (const g of groups.values()) {
    const size = g.reduce((n, f) => n + f.size, 0)
    if (cur.length > 0 && bytes + size > maxBytes) {
      batches.push(cur)
      cur = []
      bytes = 0
    }
    cur.push(...g)
    bytes += size
  }
  if (cur.length) batches.push(cur)
  if (loose.length) batches.push(loose)
  return batches
}

// ------------------------------------------------------------------------------------------- drop

type Entry = FileSystemEntry
const isFileEntry = (e: Entry): e is FileSystemFileEntry => e.isFile
const isDirEntry = (e: Entry): e is FileSystemDirectoryEntry => e.isDirectory

const fileOf = (e: FileSystemFileEntry) => new Promise<File>((resolve, reject) => e.file(resolve, reject))

async function readDir(dir: FileSystemDirectoryEntry): Promise<Entry[]> {
  const reader = dir.createReader()
  const out: Entry[] = []
  // readEntries returns at most ~100 entries per call; repeat until empty.
  for (;;) {
    const batch = await new Promise<Entry[]>((resolve, reject) => reader.readEntries(resolve, reject))
    if (batch.length === 0) return out
    out.push(...batch)
  }
}

async function walk(entry: Entry, out: File[], depth: number): Promise<void> {
  if (isFileEntry(entry)) {
    if (!isAcceptedName(entry.name)) return
    out.push(setFilePath(await fileOf(entry), entry.fullPath.replace(/^\/+/, '')))
  } else if (isDirEntry(entry) && depth < 8) {
    for (const child of await readDir(entry)) await walk(child, out, depth + 1)
  }
}

/**
 * Files of a drop, descending into dropped directories. Entries must be taken synchronously inside the
 * drop event, so call this from the handler and await the result afterwards.
 */
export function collectDroppedFiles(dt: DataTransfer | null): Promise<File[]> {
  if (!dt) return Promise.resolve([])
  const items = Array.from(dt.items ?? [])
  const entries =
    items.length > 0 && typeof items[0].webkitGetAsEntry === 'function'
      ? items.map((i) => (i.kind === 'file' ? i.webkitGetAsEntry() : null))
      : []
  if (entries.length === 0 || entries.every((e) => !e || e.isFile)) {
    return Promise.resolve(Array.from(dt.files ?? []))
  }
  const plainFiles = Array.from(dt.files ?? [])
  return (async () => {
    const out: File[] = []
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]
      if (e) await walk(e, out, 0)
      else if (plainFiles[i]) out.push(plainFiles[i])
    }
    return out
  })()
}
