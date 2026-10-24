import { parseJsonl, recordByLine } from './parse'

describe('parseJsonl', () => {
  it('returns nothing for empty input', () => {
    expect(parseJsonl('')).toEqual({ records: [], errors: [] })
    expect(parseJsonl('\n\n  \n')).toEqual({ records: [], errors: [] })
  })

  it('keeps 0-based physical line numbers across blank and invalid lines', () => {
    const { records, errors } = parseJsonl('{"type":"a"}\n\n{bad\n{"type":"b"}\n')
    expect(records.map((r) => [r.line, r.type])).toEqual([
      [0, 'a'],
      [3, 'b'],
    ])
    expect(errors).toHaveLength(1)
    expect(errors[0].line).toBe(2)
    expect(errors[0].message).not.toMatch(/Partial/)
  })

  it('flags a partial final line', () => {
    const { records, errors } = parseJsonl('{"type":"a"}\n{"type":"b","x":')
    expect(records).toHaveLength(1)
    expect(errors[0]).toMatchObject({ line: 1, message: expect.stringMatching(/^Partial last line/) })
  })

  it('handles CRLF, a BOM, non-object lines and missing type', () => {
    const { records, errors } = parseJsonl('﻿{"type":"a"}\r\n[1,2]\r\n"str"\r\n{"x":1}\r\n')
    expect(records.map((r) => r.type)).toEqual(['a', 'unknown'])
    expect(errors.map((e) => e.line)).toEqual([1, 2])
  })

  it('does not clobber a record field called line', () => {
    const { records } = parseJsonl('{"type":"a","line":42}')
    expect(records[0]).toMatchObject({ line: 0, _line: 42 })
  })

  it('caps the error list', () => {
    const { errors } = parseJsonl(Array.from({ length: 300 }, () => '{nope').join('\n'))
    expect(errors).toHaveLength(201)
    expect(errors[200]).toEqual({ line: -1, message: '100 more invalid lines not listed' })
  })

  it('parses a 5 MB line and a 25 MB file in linear time', () => {
    const big = 'A'.repeat(5_000_000)
    const line = JSON.stringify({ type: 'user', uuid: 'u1', message: { content: big } })
    const small = JSON.stringify({ type: 'assistant', uuid: 'x', message: { content: 'y'.repeat(2000) } })
    const text = [line, ...Array.from({ length: 10_000 }, () => small), line, line, line].join('\n')
    expect(text.length).toBeGreaterThan(25_000_000)
    const t0 = performance.now()
    const { records, errors } = parseJsonl(text)
    const ms = performance.now() - t0
    expect(errors).toEqual([])
    expect(records).toHaveLength(10_004)
    expect(ms).toBeLessThan(3000)
  })

  it('finds records by line', () => {
    const { records } = parseJsonl('{"type":"a"}\n\n{"type":"b"}\n{"type":"c"}')
    expect(recordByLine(records, 2)?.type).toBe('b')
    expect(recordByLine(records, 1)).toBeUndefined()
    expect(recordByLine(records, 3)?.type).toBe('c')
  })
})
