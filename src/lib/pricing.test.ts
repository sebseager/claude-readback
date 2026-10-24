import { estimateCostUsd, normalizeModelId, priceFor } from './pricing'

const usage = (o: Partial<Parameters<typeof estimateCostUsd>[1]> = {}) => ({
  inputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  outputTokens: 0,
  ...o,
})

describe('pricing', () => {
  it('normalizes provider prefixes and context suffixes', () => {
    expect(normalizeModelId('us.anthropic.claude-opus-5-5[1m]')).toBe('claude-opus-5-5')
    expect(normalizeModelId('claude-opus-4-5@20251101')).toBe('claude-opus-4-5')
  })

  it('matches the longest prefix', () => {
    expect(priceFor('claude-opus-5-5')?.input).toBe(4)
    expect(priceFor('claude-opus-5')?.input).toBe(5)
    expect(priceFor('claude-sonnet-4-5-20250929')?.input).toBe(3)
    expect(priceFor('claude-fable-5-1')?.cacheRead).toBe(0.25)
    expect(priceFor('gpt-4')).toBeUndefined()
  })

  it('estimates cost per token type', () => {
    expect(estimateCostUsd('claude-opus-5-5', usage({ inputTokens: 1_000_000 }))).toBeCloseTo(4)
    expect(estimateCostUsd('claude-opus-5-5', usage({ outputTokens: 1_000_000 }))).toBeCloseTo(20)
    expect(estimateCostUsd('claude-opus-5-5', usage({ cacheReadTokens: 1_000_000 }))).toBeCloseTo(0.2)
    expect(estimateCostUsd('claude-sonnet-5-5', usage({ cacheWriteTokens: 1_000_000 }))).toBeCloseTo(2.5)
    expect(
      estimateCostUsd(
        'claude-sonnet-5-5',
        usage({ cacheWriteTokens: 1_000_000, cacheWrite1hTokens: 1_000_000 }),
      ),
    ).toBeCloseTo(4)
    expect(estimateCostUsd('nope', usage({ inputTokens: 5 }))).toBeUndefined()
  })

  it('applies long-context pricing for Haiku 5.5 above 100K prompt tokens', () => {
    expect(estimateCostUsd('claude-haiku-5-5', usage({ inputTokens: 100_000 }))).toBeCloseTo(0.01)
    expect(
      estimateCostUsd('claude-haiku-5-5', usage({ inputTokens: 200_000, outputTokens: 1_000_000 })),
    ).toBeCloseTo(0.1 + 2.5)
  })
})
