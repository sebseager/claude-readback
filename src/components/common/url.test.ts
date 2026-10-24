import { safeHref } from './url'

describe('safeHref', () => {
  it('accepts absolute http(s) URLs', () => {
    expect(safeHref('https://example.com/a?b=1')).toBe('https://example.com/a?b=1')
    expect(safeHref('http://localhost:4010/x')).toBe('http://localhost:4010/x')
  })

  it('rejects script and data URLs, whatever the casing or padding', () => {
    expect(safeHref('javascript:alert(1)')).toBeUndefined()
    expect(safeHref('  JavaScript:alert(1)')).toBeUndefined()
    expect(safeHref('data:text/html;base64,PHNjcmlwdD4=')).toBeUndefined()
    expect(safeHref('vbscript:msgbox(1)')).toBeUndefined()
    expect(safeHref('file:///etc/passwd')).toBeUndefined()
  })

  it('rejects relative strings and non-strings', () => {
    expect(safeHref('src/api/forecast.ts')).toBeUndefined()
    expect(safeHref('/docs/readme')).toBeUndefined()
    expect(safeHref('//evil.example.com')).toBeUndefined()
    expect(safeHref('')).toBeUndefined()
    expect(safeHref(undefined)).toBeUndefined()
    expect(safeHref(42)).toBeUndefined()
  })
})
