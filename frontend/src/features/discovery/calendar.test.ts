import { describe, expect, it } from 'vitest'
import { calendarApiParams, calendarEventRanges, calendarEventsByDay, calendarMonth, calendarSelectedEvent, calendarTone, calendarWeeks, monthDays, monthRange, shiftMonth } from './calendar'
import { isDiscoveryResults, parseBrowse } from './browse'
import { loadAllEvents } from '../catalog/allEvents'
import type { PublicEventSummary } from '../catalog/api'

function event(id: number, occurrences = [{ startDate: '2026-10-03', endDate: '2026-10-03', startTime: null, endTime: null }]): PublicEventSummary {
  return { id, participantCount: 0, event: { name: `행사 ${id}`, occurrences } } as PublicEventSummary
}
describe('calendar dates and complete month data', () => {
  it('opens calendar URLs as results and validates the month', () => {
    expect(isDiscoveryResults('/discover', new URLSearchParams('view=calendar'))).toBe(true)
    expect(calendarMonth('2026-13', '2026-10-02')).toBe('2026-10')
    expect(calendarMonth('bad', '2026-10-02')).toBe('2026-10')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })
  it('fetches the whole month including its past days, leap days and category filters', () => {
    expect(monthRange('2024-02')).toEqual({ from: '2024-02-01', to: '2024-02-29' })
    expect(monthRange('2026-02').to).toBe('2026-02-28')
    const params = calendarApiParams(parseBrowse(new URLSearchParams('category=subculture&region=SEOUL&type=BIRTHDAY_CAFE&q=카페')), '2026-10')
    expect(Object.fromEntries(params)).toMatchObject({ from: '2026-10-01', to: '2026-10-31', category: 'SUBCULTURE', subcategory: 'BIRTHDAY_CAFE', q: '카페', region: 'SEOUL' })
    expect(monthDays('2026-10').filter(day => day.inMonth)).toHaveLength(31)
  })
  it('shows actual occurrence spans without filling gaps or duplicating overlapping segments', () => {
    const row = event(1, [{ startDate: '2026-09-30', endDate: '2026-10-02', startTime: null, endTime: null }, { startDate: '2026-10-02', endDate: '2026-10-02', startTime: null, endTime: null }, { startDate: '2026-10-05', endDate: '2026-10-06', startTime: null, endTime: null }])
    const days = calendarEventsByDay([row], '2026-10')
    expect(days.get('2026-10-01')).toHaveLength(1)
    expect(days.get('2026-10-02')).toHaveLength(1)
    expect(days.get('2026-10-03')).toHaveLength(0)
    expect(days.get('2026-10-06')).toHaveLength(1)
  })
  it('includes events beyond page one and combines split editions after all pages arrive', async () => {
    const saturday = { ...event(1), event: { ...event(1).event, name: '제35회 디. 페스타 (토요일)' } }
    const sunday = { ...event(7, [{ startDate: '2026-10-04', endDate: '2026-10-04', startTime: null, endTime: null }]), event: { ...event(7).event, name: '제35회 디. 페스타 (일요일)', occurrences: [{ startDate: '2026-10-04', endDate: '2026-10-04', startTime: null, endTime: null }] } }
    const first = [saturday, ...Array.from({ length: 99 }, (_, index) => event(100 + index))]
    const calls: string[] = []
    const rows = await loadAllEvents(new URLSearchParams('size=20&page=8'), async query => {
      calls.push(query)
      return { items: new URLSearchParams(query).get('page') === '0' ? first : [sunday], total: 101, page: 0, size: 100 }
    })
    expect(calls).toHaveLength(2)
    expect(new URLSearchParams(calls[0]).get('size')).toBe('100')
    expect(rows).toHaveLength(100)
    expect(calendarEventsByDay(rows, '2026-10').get('2026-10-04')?.map(row => row.id)).toContain(1)
  })
  it('reports incomplete pagination instead of silently showing a partial calendar', async () => {
    await expect(loadAllEvents(new URLSearchParams(), async () => ({ items: [], total: 101, page: 0, size: 100 }))).rejects.toThrow('일부 일정을')
  })
})

describe('continuous calendar bars and selection', () => {
  const span = (id: number, from: string, to: string) => event(id, [{ startDate: from, endDate: to, startTime: null, endTime: null }])
  it('merges consecutive and overlapping occurrences without filling real gaps', () => {
    const row = event(1, [
      { startDate: '2026-10-05', endDate: '2026-10-06', startTime: null, endTime: null },
      { startDate: '2026-10-01', endDate: '2026-10-02', startTime: null, endTime: null },
      { startDate: '2026-10-02', endDate: '2026-10-03', startTime: null, endTime: null },
    ])
    expect(calendarEventRanges(row)).toEqual([{ from: '2026-10-01', to: '2026-10-03' }, { from: '2026-10-05', to: '2026-10-06' }])
    const segments = calendarWeeks([row, row], '2026-10').flatMap(week => week.segments)
    expect(segments).toHaveLength(2)
    expect(segments.map(segment => segment.span)).toEqual([3, 2])
  })
  it('splits at week boundaries and clips at month boundaries with continuation markers', () => {
    const weeks = calendarWeeks([span(1, '2026-09-30', '2026-10-05'), span(2, '2026-10-30', '2026-11-04')], '2026-10')
    expect(weeks[0].segments[0]).toMatchObject({ from: '2026-10-01', to: '2026-10-03', column: 5, span: 3, continuesBefore: true, continuesAfter: true })
    expect(weeks[1].segments[0]).toMatchObject({ from: '2026-10-04', to: '2026-10-05', column: 1, span: 2, continuesBefore: true, continuesAfter: false })
    expect(weeks[4].segments[0]).toMatchObject({ from: '2026-10-30', to: '2026-10-31', span: 2, continuesAfter: true })
    expect(weeks).toHaveLength(5)
  })
  it('stacks overlapping events, reuses free lanes, and is independent of API ordering', () => {
    const rows = [span(2, '2026-10-02', '2026-10-03'), span(1, '2026-10-01', '2026-10-03'), span(3, '2026-10-01', '2026-10-01')]
    const weeks = calendarWeeks(rows, '2026-10')
    expect(weeks).toEqual(calendarWeeks([...rows].reverse(), '2026-10'))
    expect(weeks[0].segments.map(segment => [segment.row.id, segment.lane])).toEqual([[1, 0], [3, 1], [2, 1]])
    for (const week of weeks) for (const first of week.segments) for (const second of week.segments) {
      if (first.key !== second.key && first.lane === second.lane) expect(first.to < second.from || second.to < first.from).toBe(true)
    }
  })
  it('counts hidden bars per day and promotes them when later weeks have space', () => {
    const rows = [span(1, '2026-10-01', '2026-10-03'), span(2, '2026-10-01', '2026-10-03'), span(3, '2026-10-02', '2026-10-06')]
    const weeks = calendarWeeks(rows, '2026-10', 2)
    expect(weeks[0].segments.map(segment => segment.row.id)).toEqual([1, 2])
    expect(weeks[0].hiddenCounts).toEqual([0, 0, 0, 0, 0, 1, 1])
    expect(weeks[1].segments[0]).toMatchObject({ row: { id: 3 }, lane: 0, span: 3 })
    expect(weeks[1].hiddenCounts.every(count => count === 0)).toBe(true)
  })
  it('does not silently lose overflow events from selected day lists', () => {
    const rows = Array.from({ length: 8 }, (_, index) => span(index + 1, '2026-10-03', '2026-10-04'))
    const weeks = calendarWeeks(rows, '2026-10')
    expect(weeks[0].segments).toHaveLength(3)
    expect(weeks[0].hiddenCounts[6]).toBe(5)
    expect(calendarEventsByDay(rows, '2026-10').get('2026-10-03')).toHaveLength(8)
    expect(calendarSelectedEvent(rows, '2026-10-04', '8')?.id).toBe(8)
  })
  it('opens only an event that actually occurs on the selected day', () => {
    const rows = [span(1, '2026-10-03', '2026-10-05')]
    expect(calendarSelectedEvent(rows, '2026-10-04', '1')?.id).toBe(1)
    for (const id of [null, '0', '-1', '1.5', '999999999999999999999']) expect(calendarSelectedEvent(rows, '2026-10-04', id)).toBeUndefined()
    expect(calendarSelectedEvent(rows, '2026-10-06', '1')).toBeUndefined()
  })
  it('keeps colors stable by explicit category taxonomy with neutral unknown types', () => {
    expect(new Set(['COMIC_DOUJIN', 'DOLL', 'ONLY_EVENT', 'BIRTHDAY_CAFE', 'STATIONERY_GOODS'].map(calendarTone)).size).toBe(5)
    expect(calendarTone('COMIC_DOUJIN')).toBe('blue')
    expect(calendarTone('BIRTHDAY_CAFE')).toBe('rose')
    expect(calendarTone('WINE')).toBe('blue')
    expect(calendarTone('VOCALOID')).toBe('neutral')
    expect(calendarTone('')).toBe('neutral')
  })
  it('handles leap days and ignores impossible or reversed source dates', () => {
    expect(calendarEventRanges(span(1, '2024-02-28', '2024-03-01'))).toEqual([{ from: '2024-02-28', to: '2024-03-01' }])
    expect(calendarEventRanges(span(1, '2026-02-29', '2026-03-01'))).toEqual([])
    expect(calendarEventRanges(span(1, '2026-10-05', '2026-10-01'))).toEqual([])
    expect(calendarEventRanges(span(1, '2026-13-01', '2026-13-02'))).toEqual([])
  })
})
