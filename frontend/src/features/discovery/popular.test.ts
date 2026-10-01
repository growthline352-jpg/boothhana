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

describe('관심분야가 없는 인기 행사', () => {
  it('loads the global save ranking for guests even from a category home', async () => {
    const global = vi.spyOn(publicCatalogApi, 'popular').mockResolvedValue([scheduled(8, '2026-10-04', undefined, 2), scheduled(9, '2026-10-05', undefined, 7)])
    const interests = vi.spyOn(interestApi, 'get')
    expect((await loadPopularEvents('SUBCULTURE', null, '2026-10-02')).items.map(item => item.id)).toEqual([9, 8])
    expect(global).toHaveBeenCalledWith()
    expect(interests).not.toHaveBeenCalled()
  })
  it('uses global popularity when a signed-in member skipped or cleared interests', async () => {
    vi.spyOn(interestApi, 'get').mockResolvedValue({ userId: 4, revision: 1, onboardingStatus: 'SKIPPED', fields: {} })
    const global = vi.spyOn(publicCatalogApi, 'popular').mockResolvedValue([scheduled(9, '2026-10-05', undefined, 7)])
    const personal = vi.spyOn(interestApi, 'featured')
    expect((await loadPopularEvents('SUBCULTURE', 4, '2026-10-02')).personalized).toBe(false)
    expect(global).toHaveBeenCalledWith()
    expect(personal).not.toHaveBeenCalled()
  })
  it('does not apply another category’s preferences to an unset category', async () => {
    vi.spyOn(interestApi, 'get').mockResolvedValue({ userId: 4, revision: 1, onboardingStatus: 'DONE', fields: { FESTIVAL: { formats: ['MUSIC'], topics: [] } } })
    vi.spyOn(publicCatalogApi, 'popular').mockResolvedValue([scheduled(9, '2026-10-05', undefined, 7)])
    expect((await loadPopularEvents('SUBCULTURE', 4, '2026-10-02')).personalized).toBe(false)
  })
  it('keeps a category-only selection scoped to that field even without child options', async () => {
    vi.spyOn(interestApi, 'get').mockResolvedValue({ userId: 4, revision: 1, onboardingStatus: 'DONE', fields: {
      SUBCULTURE: { formats: [], topics: [] }, FESTIVAL: { formats: ['MUSIC'], topics: [] },
    } })
    const featured = vi.spyOn(interestApi, 'featured').mockResolvedValue({ mode: 'RECENT', personalized: true, items: [scheduled(8, '2026-10-03')] })
    const global = vi.spyOn(publicCatalogApi, 'popular')
    const result = await loadPopularEvents('SUBCULTURE', 4, '2026-10-02')
    expect(result.personalized).toBe(true)
    expect(result.items.map(item => [item.id, item.saveCount])).toEqual([[8, 0]])
    expect(featured).toHaveBeenCalledExactlyOnceWith('SUBCULTURE', '', true)
    expect(global).not.toHaveBeenCalled()
  })
  it('fills an empty save ranking from all three categories with honest zero counts', async () => {
    vi.spyOn(publicCatalogApi, 'popular').mockResolvedValue([])
    const lists = vi.spyOn(publicCatalogApi, 'calendar').mockImplementation(async query => {
      const params = new URLSearchParams(query)
      expect(params.get('from')).toBe('2026-10-02')
      return params.get('category') === 'SUBCULTURE' ? [scheduled(8, '2026-10-05')]
        : params.get('category') === 'EXHIBITION' ? [scheduled(9, '2026-10-03')] : [scheduled(10, '2026-10-01', '2026-10-04')]
    })
    const result = await loadPopularEvents(undefined, null, '2026-10-02')
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
    await expect(loadPopularEvents(undefined, null, '2026-10-02')).rejects.toThrow('ranking unavailable')
    expect(lists).not.toHaveBeenCalled()
  })
  it('does not show a partial global fallback when one category fails', async () => {
    vi.spyOn(publicCatalogApi, 'popular').mockResolvedValue([])
    vi.spyOn(publicCatalogApi, 'calendar').mockImplementation(async query => {
      if (new URLSearchParams(query).get('category') === 'FESTIVAL') throw new Error('festival unavailable')
      return [scheduled(8, '2026-10-03')]
    })
    await expect(loadPopularEvents(undefined, null, '2026-10-02')).rejects.toThrow('festival unavailable')
  })
  it('rejects preferences returned for a different account', async () => {
    vi.spyOn(interestApi, 'get').mockResolvedValue({ userId: 99, revision: 1, onboardingStatus: 'DONE', fields: {} })
    await expect(loadPopularEvents(undefined, 4, '2026-10-02')).rejects.toThrow('관심분야를 다시 확인')
  })
  it('combines category-specific personalized rankings before limiting the portal to five', async () => {
    vi.spyOn(interestApi, 'get').mockResolvedValue({ userId: 4, revision: 1, onboardingStatus: 'DONE', fields: {
      SUBCULTURE: { formats: [], topics: ['VOCALOID'] }, FESTIVAL: { formats: ['MUSIC'], topics: [] },
    } })
    const featured = vi.spyOn(interestApi, 'featured').mockImplementation(async category => ({ mode: 'POPULAR', personalized: true,
      items: category === 'SUBCULTURE' ? [1, 2, 3, 4, 5].map(id => scheduled(id, '2026-10-04', undefined, 8 - id)) : [scheduled(9, '2026-10-03', undefined, 8)] }))
    const global = vi.spyOn(publicCatalogApi, 'popular')
    const result = await loadPopularEvents(undefined, 4, '2026-10-02')
    expect(result.personalized).toBe(true)
    expect(result.items.map(item => item.id)).toEqual([9, 1, 2, 3, 4])
    expect(featured).toHaveBeenCalledWith('SUBCULTURE', '', true)
    expect(featured).toHaveBeenCalledWith('FESTIVAL', '', true)
    expect(global).not.toHaveBeenCalled()
  })
  it('uses upcoming dates and real IDs to break personalized save-count ties', async () => {
    vi.spyOn(interestApi, 'get').mockResolvedValue({ userId: 4, revision: 1, onboardingStatus: 'DONE', fields: { SUBCULTURE: { formats: [], topics: [] } } })
    vi.spyOn(interestApi, 'featured').mockResolvedValue({ mode: 'POPULAR', personalized: true,
      items: [scheduled(9, '2026-10-04', undefined, 3), scheduled(8, '2026-10-03', undefined, 3), scheduled(7, '2026-10-03', undefined, 3)] })
    expect((await loadPopularEvents('SUBCULTURE', 4, '2026-10-02')).items.map(item => item.id)).toEqual([7, 8, 9])
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
