import { batchFiles, batchKeyOf, collectDroppedFiles, isAcceptedName, pathOf } from './files'

const S1 = '2b6dc6d5-5b10-44b6-9320-b097c6661e6c'
const S2 = '5e55a0de-0000-4000-8000-000000000001'

describe('accepted files', () => {
  it('takes transcripts and subagent metadata only', () => {
    expect(isAcceptedName('x/a.jsonl')).toBe(true)
    expect(isAcceptedName('agent-a1.meta.json')).toBe(true)
    expect(isAcceptedName('A.JSONL')).toBe(true)
    expect(isAcceptedName('tool-results/abc.txt')).toBe(false)
    expect(isAcceptedName('settings.json')).toBe(false)
  })
})

describe('batching', () => {
  it('keys files by the session they belong to', () => {
    expect(batchKeyOf(`${S1}.jsonl`)).toBe(S1)
    expect(batchKeyOf(`proj/${S1}/subagents/agent-a1.jsonl`)).toBe(S1)
    expect(batchKeyOf(`proj\\${S1}\\subagents\\agent-a1.meta.json`)).toBe(S1)
    expect(batchKeyOf('agent-a1.jsonl')).toBe('')
  })

  it('keeps a session together, splits by size, and puts loose files last', () => {
    const f = (path: string, size: number) => ({ path, size })
    const batches = batchFiles(
      [
        f('agent-loose.jsonl', 1),
        f(`${S1}.jsonl`, 60),
        f(`${S1}/subagents/agent-a.jsonl`, 30),
        f(`${S2}.jsonl`, 10),
      ],
      80,
    )
    expect(batches.map((b) => b.map((x) => x.path))).toEqual([
      [`${S1}.jsonl`, `${S1}/subagents/agent-a.jsonl`],
      [`${S2}.jsonl`],
      ['agent-loose.jsonl'],
    ])
  })
})

// Minimal FileSystemEntry fakes (jsdom has no drag-and-drop entries).
type FakeEntry = { isFile: boolean; isDirectory: boolean; name: string; fullPath: string } & Record<
  string,
  unknown
>
const fileEntry = (fullPath: string): FakeEntry => {
  const name = fullPath.split('/').pop()!
  return {
    isFile: true,
    isDirectory: false,
    name,
    fullPath,
    file: (ok: (f: File) => void) => ok(new File(['{}\n'], name)),
  }
}
const dirEntry = (fullPath: string, children: FakeEntry[]): FakeEntry => ({
  isFile: false,
  isDirectory: true,
  name: fullPath.split('/').pop()!,
  fullPath,
  createReader: () => {
    // Hand entries out in pages of two, like browsers do with large folders.
    let rest = [...children]
    return {
      readEntries: (ok: (e: FakeEntry[]) => void) => {
        ok(rest.slice(0, 2))
        rest = rest.slice(2)
      },
    }
  },
})

describe('collectDroppedFiles', () => {
  it('walks dropped folders and keeps relative paths', async () => {
    const folder = dirEntry('/proj', [
      fileEntry(`/proj/${S1}.jsonl`),
      dirEntry(`/proj/${S1}`, [
        dirEntry(`/proj/${S1}/subagents`, [
          fileEntry(`/proj/${S1}/subagents/agent-a.jsonl`),
          fileEntry(`/proj/${S1}/subagents/agent-a.meta.json`),
          fileEntry(`/proj/${S1}/subagents/agent-b.jsonl`),
        ]),
        dirEntry(`/proj/${S1}/tool-results`, [fileEntry(`/proj/${S1}/tool-results/x.txt`)]),
      ]),
      fileEntry('/proj/memory.md'),
    ])
    const dt = {
      items: [{ kind: 'file', webkitGetAsEntry: () => folder }],
      files: [],
    } as unknown as DataTransfer
    const files = await collectDroppedFiles(dt)
    expect(files.map(pathOf)).toEqual([
      `proj/${S1}.jsonl`,
      `proj/${S1}/subagents/agent-a.jsonl`,
      `proj/${S1}/subagents/agent-a.meta.json`,
      `proj/${S1}/subagents/agent-b.jsonl`,
    ])
  })

  it('returns plain files as they are', async () => {
    const file = new File(['{}'], 'a.jsonl')
    const dt = {
      items: [{ kind: 'file', webkitGetAsEntry: () => fileEntry('/a.jsonl') }],
      files: [file],
    } as unknown as DataTransfer
    expect(await collectDroppedFiles(dt)).toEqual([file])
    expect(await collectDroppedFiles(null)).toEqual([])
  })
})
