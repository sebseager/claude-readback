import { dedupeContinued } from './grouping'
import type { SessionSummary } from '@/lib/transcript/types'
import { dayLabel, filterSessions, groupSessions, sessionSubtitle, sortSessions } from './grouping'

const NOW = new Date(2026, 9, 24, 15, 0).getTime() // Sat Oct 24 2026, 15:00 local
const at = (daysAgo: number, hour = 10) => new Date(2026, 9, 24 - daysAgo, hour).toISOString()

const summary = (sessionId: string, startedAt: string, extra: Partial<SessionSummary> = {}): SessionSummary =>
  ({
    sessionId,
    title: `Session ${sessionId}`,
    titleSource: 'ai-title',
    cwd: '/home/dev/demo-project',
    projectName: 'demo-project',
    startedAt,
    endedAt: startedAt,
    durationMs: 0,
    turnCount: 1,
    ...extra,
  }) as SessionSummary

describe('dayLabel', () => {
  it('buckets by calendar day', () => {
    expect(dayLabel(at(0, 0), NOW)).toBe('Today')
    expect(dayLabel(at(1, 23), NOW)).toBe('Yesterday')
    expect(dayLabel(at(2), NOW)).toBe('This week')
    expect(dayLabel(at(6), NOW)).toBe('This week')
    expect(dayLabel(at(12), NOW)).toBe('Oct 12')
    expect(dayLabel(new Date(2025, 2, 3).toISOString(), NOW)).toBe('Mar 3, 2025')
    expect(dayLabel('', NOW)).toBe('Undated')
  })
})

describe('groupSessions', () => {
  it('sorts newest first and groups by day', () => {
    const list = [
      summary('old-b', at(12, 9)),
      summary('today-1', at(0, 9)),
      summary('week', at(3)),
      summary('today-2', at(0, 14)),
      summary('old-a', at(12, 18)),
      summary('yday', at(1)),
      summary('undated', ''),
    ]
    const groups = groupSessions(list, NOW)
    expect(groups.map((g) => [g.label, g.sessions.map((s) => s.sessionId)])).toEqual([
      ['Today', ['today-2', 'today-1']],
      ['Yesterday', ['yday']],
      ['This week', ['week']],
      ['Oct 12', ['old-a', 'old-b']],
      ['Undated', ['undated']],
    ])
  })

  it('breaks startedAt ties by session id', () => {
    expect(sortSessions([summary('b', at(0)), summary('a', at(0))]).map((s) => s.sessionId)).toEqual([
      'a',
      'b',
    ])
  })
})

describe('filterSessions / sessionSubtitle', () => {
  const list = [
    summary('1', at(0), { title: 'Fix flaky auth test', projectName: 'api' }),
    summary('2', at(0), {
      title: 'Scaffold viewer',
      projectName: 'claude-readback',
      gitBranch: 'feat/sidebar',
    }),
  ]
  it('matches title, project and branch, case-insensitively', () => {
    expect(filterSessions(list, 'AUTH').map((s) => s.sessionId)).toEqual(['1'])
    expect(filterSessions(list, 'readback').map((s) => s.sessionId)).toEqual(['2'])
    expect(filterSessions(list, 'sidebar').map((s) => s.sessionId)).toEqual(['2'])
    expect(filterSessions(list, '  ')).toHaveLength(2)
  })

  it('formats project · turns · duration', () => {
    expect(sessionSubtitle(summary('x', at(0), { turnCount: 14, durationMs: 48 * 60_000 }))).toBe(
      'demo-project · 14 turns · 48m 0s',
    )
    expect(sessionSubtitle(summary('x', at(0), { turnCount: 1 }))).toBe('demo-project · 1 turn')
  })
})

describe('dedupeContinued', () => {
  const s = (sessionId: string, continuedInSessionId?: string) =>
    ({ sessionId, continuedInSessionId }) as unknown as import('@/lib/transcript/types').SessionSummary
  it('folds a continued session into its stored continuation', () => {
    const list = [s('old', 'new'), s('new'), s('other', 'missing')]
    expect(dedupeContinued(list).map((x) => x.sessionId)).toEqual(['new', 'other'])
  })
  it('keeps the older one listed while it is open', () => {
    expect(dedupeContinued([s('old', 'new'), s('new')], 'old').map((x) => x.sessionId)).toEqual([
      'old',
      'new',
    ])
  })
})
