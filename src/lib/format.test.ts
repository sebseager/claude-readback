import {
  formatDuration,
  formatInteger,
  formatPercent,
  formatTokens,
  formatUsd,
  shortModelName,
} from './format'

describe('format helpers', () => {
  it('formats tokens', () => {
    expect([812, 12_400, 180_000, 999_400, 1_100_000, 2_500_000_000].map(formatTokens)).toEqual([
      '812',
      '12.4k',
      '180k',
      '999k',
      '1.1M',
      '2.5B',
    ])
    expect(formatInteger(1_234_567)).toBe('1,234,567')
  })

  it('formats durations', () => {
    expect([340, 4_200, 45_000, 105_284, 3_723_000, 200_000_000].map(formatDuration)).toEqual([
      '340ms',
      '4.2s',
      '45s',
      '1m 45s',
      '1h 2m',
      '2d 7h',
    ])
    expect(formatDuration(-1)).toBe('–')
  })

  it('formats money and percentages', () => {
    expect([1.234, 0, 0.0042, 1234.5].map(formatUsd)).toEqual(['$1.23', '$0.00', '$0.0042', '$1,234.50'])
    expect([0.9234, 0.0042, 1].map(formatPercent)).toEqual(['92%', '0.4%', '100%'])
  })

  it('shortens model ids', () => {
    expect(shortModelName('claude-opus-5-5')).toBe('Opus 5.5')
    expect(shortModelName('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
    expect(shortModelName('claude-opus-4-20250514')).toBe('Opus 4')
    expect(shortModelName('us.anthropic.claude-sonnet-4-6[1m]')).toBe('Sonnet 4.6')
    expect(shortModelName('claude-3-5-haiku-20241022')).toBe('Haiku 3.5')
    expect(shortModelName('claude-fable-5')).toBe('Fable 5')
    expect(shortModelName('gpt-x')).toBe('gpt-x')
  })
})
