import { render } from '@testing-library/react'
import { countMatches, findMatches, highlightText, MAX_MARKS } from './highlight'
import { formatDuration, formatTokens } from './format'

describe('highlightText', () => {
  it('returns the text untouched when the query is empty', () => {
    expect(highlightText('Hello world', '')).toBe('Hello world')
    expect(highlightText('Hello world', '   ')).toBe('Hello world')
  })

  it('returns the text untouched when nothing matches', () => {
    expect(highlightText('Hello world', 'xyz')).toBe('Hello world')
  })

  it('wraps case-insensitive matches in <mark>, preserving the original casing', () => {
    const { container } = render(<p>{highlightText('Retry, retry, RETRY!', 'retry')}</p>)
    const marks = container.querySelectorAll('mark')
    expect(marks).toHaveLength(3)
    expect([...marks].map((m) => m.textContent)).toEqual(['Retry', 'retry', 'RETRY'])
    expect(container.textContent).toBe('Retry, retry, RETRY!')
  })

  it('rings only the active match', () => {
    const { container } = render(<p>{highlightText('a b a b a', 'a', 1)}</p>)
    const marks = container.querySelectorAll('mark')
    expect(marks[1]).toHaveAttribute('data-search-active')
    expect(marks[1].className).toContain('ring')
    expect(marks[0]).not.toHaveAttribute('data-search-active')
    expect(marks[2].className).not.toContain('ring')
  })

  it('treats regex characters literally', () => {
    expect(countMatches('a.b a*b (x)', 'a.b')).toBe(1)
    expect(countMatches('a.b a*b (x)', '(x)')).toBe(1)
    expect(findMatches('cost $1.84', '$1.84')).toEqual([[5, 10]])
  })

  it('caps the marks of long texts, keeping a window around the active match', () => {
    const long = 'ab '.repeat(10_000)
    const first = render(<p>{highlightText(long, 'a')}</p>).container
    expect(first.querySelectorAll('mark')).toHaveLength(MAX_MARKS)
    expect(first.textContent).toBe(long)
    const deep = render(<p>{highlightText(long, 'a', 9_000)}</p>).container
    expect(deep.querySelectorAll('mark')).toHaveLength(MAX_MARKS)
    const ring = deep.querySelector('[data-search-active]')
    // The 9000th "a" sits at offset 9000 * 3.
    expect(ring?.previousSibling?.textContent?.length).toBeGreaterThan(0)
    expect(deep.textContent?.indexOf('ab', 0)).toBe(0)
    expect([...deep.querySelectorAll('mark')].indexOf(ring as HTMLElement)).toBe(MAX_MARKS / 2)
  })
})

describe('formatters', () => {
  it('formats token counts compactly', () => {
    expect(formatTokens(812)).toBe('812')
    expect(formatTokens(12_400)).toBe('12.4k')
    expect(formatTokens(180_000)).toBe('180k')
    expect(formatTokens(1_100_000)).toBe('1.1M')
    expect(formatTokens(1_000)).toBe('1k')
  })

  it('formats durations', () => {
    expect(formatDuration(340)).toBe('340ms')
    expect(formatDuration(4200)).toBe('4.2s')
    expect(formatDuration(105_284)).toBe('1m 45s')
  })
})

describe('elapsedMs', () => {
  it('clamps out-of-order timestamps at 0', async () => {
    const { elapsedMs } = await import('./format')
    expect(elapsedMs('2026-01-01T00:00:05Z', '2026-01-01T00:00:01Z')).toBe(0)
    expect(elapsedMs('2026-01-01T00:00:01Z', '2026-01-01T00:00:03Z')).toBe(2000)
    expect(elapsedMs('nope', '2026-01-01T00:00:03Z')).toBeUndefined()
  })
})
