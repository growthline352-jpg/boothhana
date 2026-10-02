import { afterEach, describe, expect, it, vi } from 'vitest'
import { publicCatalogApi, type PopularEventSummary } from '../catalog/api'
import { interestApi } from '../interests/api'
import { loadAllEvents } from '../catalog/allEvents'
import { loadPopularEvents, rankedPopularEvents, unsavedUpcomingEvents } from './popular'

const row = (id: number, name: string, saveCount: number, publishedAt = '2026-09-29T00:00:00Z'): PopularEventSummary => ({
  id, saveCount, publishedAt, participantCount: 0,
  event: { name, subcategory: 'ONLY_EVENT', organizer: null, edition: null, region: 'SEOUL', venueName: null,
    address: null, description: '', admission: null, subjects: [], occurrences: [], sources: [], banners: [], warnings: [] },
})

const scheduled = (id: number, startDate: string, endDate = startDate, saveCount = 0): PopularEventSummary => ({
  ...row(id, `행사 ${id}`, saveCount),
  event: { ...row(id, '', saveCount).event, occurrences: [{ startDate, endDate, startTime: null, endTime: null }] },
})

afterEach(() => vi.restoreAllMocks())

describe('공통 인기 행사', () => {
  it.each(['SUBCULTURE', 'EXHIBITION', 'FESTIVAL', undefined])('requests the shared save ranking for %s without interests', async category => {
    const ranking = vi.spyOn(publicCatalogApi, 'popular').mockResolvedValue([scheduled(8, '2026-10-04', undefined, 2), scheduled(9, '2026-10-05', undefined, 7)])
    const interests = vi.spyOn(interestApi, 'get')
    const personal = vi.spyOn(interestApi, 'featured')
    expect((await loadPopularEvents(category, '2026-10-02')).items.map(item => item.id)).toEqual([9, 8])
    expect(ranking).toHaveBeenCalledExactlyOnceWith(category)
    expect(interests).not.toHaveBeenCalled()
    expect(personal).not.toHaveBeenCalled()
  })
  it.each(['SUBCULTURE', 'EXHIBITION', 'FESTIVAL'])('keeps the zero-save fallback within %s', async category => {
    vi.spyOn(publicCatalogApi, 'popular').mockResolvedValue([])
    const lists = vi.spyOn(publicCatalogApi, 'calendar').mockResolvedValue([scheduled(8, '2026-10-03')])
    expect((await loadPopularEvents(category, '2026-10-02')).items.map(item => [item.id, item.saveCount])).toEqual([[8, 0]])
    expect(lists).toHaveBeenCalledExactlyOnceWith(new URLSearchParams({ category, from: '2026-10-02', sort: 'DATE_ASC' }).toString(), false)
  })
  it('keeps an empty category empty instead of filling it from other categories', async () => {
    vi.spyOn(publicCatalogApi, 'popular').mockResolvedValue([])
    const lists = vi.spyOn(publicCatalogApi, 'calendar').mockResolvedValue([])
    expect((await loadPopularEvents('FESTIVAL', '2026-10-02')).items).toEqual([])
    expect(lists).toHaveBeenCalledTimes(1)
  })
  it('fills an empty save ranking from all three categories with honest zero counts', async () => {
    vi.spyOn(publicCatalogApi, 'popular').mockResolvedValue([])
    const lists = vi.spyOn(publicCatalogApi, 'calendar').mockImplementation(async query => {
      const params = new URLSearchParams(query)
      expect(params.get('from')).toBe('2026-10-02')
      return params.get('category') === 'SUBCULTURE' ? [scheduled(8, '2026-10-05')]
        : params.get('category') === 'EXHIBITION' ? [scheduled(9, '2026-10-03')] : [scheduled(10, '2026-10-01', '2026-10-04')]
    })
    const result = await loadPopularEvents(undefined, '2026-10-02')
    expect(lists).toHaveBeenCalledTimes(3)
    expect(lists.mock.calls.every(call => call[1] === false)).toBe(true)
    expect(result.items.map(item => [item.id, item.saveCount])).toEqual([[10, 0], [9, 0], [8, 0]])
  })
  it('excludes ended, canceled, postponed and invalid schedules and sorts ties deterministically', () => {
    const excluded = ['CANCELED', 'POSTPONED', 'RESCHEDULED'] as const
    const rows = [scheduled(8, '2026-10-03'), scheduled(7, '2026-10-03'), scheduled(2, '2026-09-30'), scheduled(3, '2026-02-30'),
      ...excluded.map((state, index) => ({ ...scheduled(20 + index, '2026-10-03'), event: { ...scheduled(20 + index, '2026-10-03').event, operationStatus: { state, note: null, checkedOn: null, sourceUrl: null } } }))]
    expect(unsavedUpcomingEvents(rows, '2026-10-02').map(item => item.id)).toEqual([7, 8])
    expect(unsavedUpcomingEvents([], '2026-10-02')).toEqual([])
  })
  it('filters canceled edition days before grouping and keeps the surviving day’s real ID', async () => {
    const saturday = { ...scheduled(1, '2026-10-03'), event: { ...scheduled(1, '2026-10-03').event, name: '제35회 디. 페스타 (토요일)' } }
    const sunday = { ...scheduled(7, '2026-10-04'), event: { ...scheduled(7, '2026-10-04').event, name: '제35회 디. 페스타 (일요일)' } }
    const canceled = { ...saturday, event: { ...saturday.event, operationStatus: { state: 'CANCELED' as const, note: null, checkedOn: null, sourceUrl: null } } }
    const raw = await loadAllEvents(new URLSearchParams(), async () => ({ items: [canceled, sunday], page: 0, size: 100, total: 2 }), false)
    expect(raw.map(item => item.id)).toEqual([1, 7])
    expect(unsavedUpcomingEvents(raw, '2026-10-02').map(item => item.id)).toEqual([7])
    expect(unsavedUpcomingEvents([saturday, sunday], '2026-10-02')[0].event.occurrences).toHaveLength(2)
    expect(unsavedUpcomingEvents([saturday, sunday], '2026-10-04')[0].id).toBe(7)
    const canceledSunday = { ...sunday, event: { ...sunday.event, operationStatus: canceled.event.operationStatus } }
    expect(unsavedUpcomingEvents([saturday, canceledSunday], '2026-10-02')[0].event.occurrences.map(day => day.startDate)).toEqual(['2026-10-03'])
  })
  it('limits the zero-save fallback to six cards', () => {
    expect(unsavedUpcomingEvents(Array.from({ length: 8 }, (_, index) => scheduled(index + 10, '2026-10-03')), '2026-10-02')).toHaveLength(6)
  })
  it('does not invent zero counts after a failed save-ranking request', async () => {
    vi.spyOn(publicCatalogApi, 'popular').mockRejectedValue(new Error('ranking unavailable'))
    const lists = vi.spyOn(publicCatalogApi, 'calendar')
    await expect(loadPopularEvents(undefined, '2026-10-02')).rejects.toThrow('ranking unavailable')
    expect(lists).not.toHaveBeenCalled()
  })
  it('does not show a partial global fallback when one category fails', async () => {
    vi.spyOn(publicCatalogApi, 'popular').mockResolvedValue([])
    vi.spyOn(publicCatalogApi, 'calendar').mockImplementation(async query => {
      if (new URLSearchParams(query).get('category') === 'FESTIVAL') throw new Error('festival unavailable')
      return [scheduled(8, '2026-10-03')]
    })
    await expect(loadPopularEvents(undefined, '2026-10-02')).rejects.toThrow('festival unavailable')
  })
})

describe('인기 행사 순위', () => {
  it('orders by actual save count and preserves server date order for ties', () => {
    const ranked = rankedPopularEvents([row(8, '행사 A', 2), row(9, '행사 B', 4), row(10, '행사 C', 2, '2026-09-30T00:00:00Z')])
    expect(ranked.map(item => item.id)).toEqual([9, 8, 10])
  })
  it('preserves the API distinct-member count for a combined edition', () => {
    const ranked = rankedPopularEvents([row(1, '제35회 디. 페스타', 5), row(8, '다른 행사', 6)])
    expect(ranked.map(item => [item.id, item.saveCount])).toEqual([[8, 6], [1, 5]])
  })
  it('leaves an unpaired day under its real public ID', () => {
    expect(rankedPopularEvents([row(7, '제35회 디. 페스타 (일요일)', 5)])[0].id).toBe(7)
  })
})
