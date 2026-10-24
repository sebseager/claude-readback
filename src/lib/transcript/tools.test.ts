import { summarizeTool, toolCategory } from './tools'

describe('summarizeTool', () => {
  it.each([
    ['Bash', { command: 'ls -la', description: 'List files' }, 'List files'],
    ['Bash', { command: 'ls   -la\nsrc' }, 'ls -la src'],
    ['Read', { file_path: '/a/b.ts' }, '/a/b.ts'],
    ['Edit', { file_path: '/a/b.ts', old_string: 'x' }, '/a/b.ts'],
    ['Write', { file_path: '/a/c.ts', content: 'x' }, '/a/c.ts'],
    ['MultiEdit', { file_path: '/a/d.ts', edits: [] }, '/a/d.ts'],
    ['Grep', { pattern: 'foo', path: 'src' }, 'foo in src'],
    ['Grep', { pattern: 'foo' }, 'foo'],
    ['Glob', { pattern: '**/*.ts' }, '**/*.ts'],
    ['Agent', { description: 'Research', prompt: 'long' }, 'Research'],
    ['Task', { description: 'Legacy' }, 'Legacy'],
    ['WebFetch', { url: 'https://example.com' }, 'https://example.com'],
    ['WebSearch', { query: 'claude' }, 'claude'],
    ['AskUserQuestion', { questions: [{}, {}] }, '2 questions'],
    ['AskUserQuestion', { questions: [{}] }, '1 question'],
    ['TodoWrite', { todos: [{}, {}, {}] }, '3 todos'],
    ['Skill', { skill: 'pdf' }, 'pdf'],
    ['SendMessage', { to: 'a1', message: 'hi' }, 'to a1: hi'],
  ])('%s', (name, input, expected) => {
    expect(summarizeTool(name, input)).toBe(expected)
  })

  it('falls back to compact JSON of at most 80 chars', () => {
    expect(summarizeTool('mcp__x__y', { a: 1 })).toBe('{"a":1}')
    const long = summarizeTool('Unknown', { text: 'z'.repeat(5000), n: 1 })
    expect(long.length).toBeLessThanOrEqual(80)
    expect(long.startsWith('{"text":"zzz')).toBe(true)
    expect(summarizeTool('Unknown', {})).toBe('')
    expect(summarizeTool('Unknown', undefined)).toBe('')
  })

  it('truncates long summaries', () => {
    expect(summarizeTool('Bash', { command: 'x'.repeat(200) })).toHaveLength(80)
  })
})

describe('toolCategory', () => {
  it.each([
    ['Bash', 'shell'],
    ['Read', 'file-read'],
    ['Edit', 'file-write'],
    ['Write', 'file-write'],
    ['Grep', 'search'],
    ['Glob', 'search'],
    ['WebFetch', 'web'],
    ['WebSearch', 'web'],
    ['Agent', 'agent'],
    ['Task', 'agent'],
    ['AskUserQuestion', 'ask'],
    ['TodoWrite', 'todo'],
    ['mcp__github__create_issue', 'mcp'],
    ['Skill', 'other'],
  ])('%s → %s', (name, cat) => {
    expect(toolCategory(name)).toBe(cat)
  })
})
