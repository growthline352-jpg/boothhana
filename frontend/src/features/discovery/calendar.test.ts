import { describe, expect, it } from 'vitest'
import { calendarApiParams, calendarEventsByDay, calendarMonth, monthDays, monthRange, shiftMonth } from './calendar'
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
