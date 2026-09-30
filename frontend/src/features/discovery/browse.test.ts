import { describe, expect, it } from 'vitest'
import { cardOccurrences, eventDateLabel, eventTimeLabels, homeBrowseApiParams, homeEventSections, homeRecentApiParams, isDiscoveryResults, latestFeaturedEvents, parseBrowse, periodRange, searchResultsHref } from './browse'
import type { PublicEventSummary } from '../catalog/api'

describe('searchResultsHref', () => {
  it('routes a home search to the results page and resets pagination', () => {
    const href = searchResultsHref(
      new URLSearchParams('category=subculture&period=weekend&page=3&region=SEOUL'),
      'subculture',
      '  프로젝트돌  ',
    )
    const url = new URL(href, 'https://boothhana.test')

    expect(url.pathname).toBe('/discover')
    expect(url.searchParams.get('view')).toBe('results')
    expect(url.searchParams.get('q')).toBe('프로젝트돌')
    expect(url.searchParams.get('category')).toBe('subculture')
    expect(url.searchParams.get('period')).toBe('weekend')
    expect(url.searchParams.get('region')).toBe('SEOUL')
    expect(url.searchParams.has('page')).toBe(false)
  })
})

describe('discovery page mode', () => {
  it('keeps category tabs on their category landing page', () => {
    expect(isDiscoveryResults('/discover', new URLSearchParams('category=exhibitions'))).toBe(false)
    expect(isDiscoveryResults('/discover', new URLSearchParams('category=festivals'))).toBe(false)
    expect(isDiscoveryResults('/discover', new URLSearchParams('category=festivals&region=SEOUL'))).toBe(false)
  })

  it('opens results only for an explicit search or result filter', () => {
    expect(isDiscoveryResults('/discover', new URLSearchParams('category=exhibitions&view=results'))).toBe(true)
    expect(isDiscoveryResults('/discover', new URLSearchParams('category=exhibitions&q=와인'))).toBe(true)
    expect(isDiscoveryResults('/discover', new URLSearchParams('category=festivals&type=MUSIC&period=month'))).toBe(true)
  })

  it('opens the full list only after the full-view link or search', () => {
    const home = new URLSearchParams('category=subculture&region=SEOUL')
    expect(isDiscoveryResults('/discover', home)).toBe(false)
    const all = new URL(searchResultsHref(home, 'subculture', ''), 'https://boothana.kr')
    expect(isDiscoveryResults(all.pathname, all.searchParams)).toBe(true)
    expect(all.searchParams.get('region')).toBe('SEOUL')
  })
})

describe('home event sections', () => {
  const row = (id: number, startDate: string, endDate: string, state = 'SCHEDULED') => ({
    id, event: { occurrences: [{ startDate, endDate, startTime: null, endTime: null }],
      operationStatus: { state } },
  }) as PublicEventSummary

  it('keeps opening and closing events distinct and sorts closing by final day', () => {
    const rows = [row(1, '2026-09-22', '2026-10-02'), row(2, '2026-10-02', '2026-10-03'),
      row(3, '2026-09-20', '2026-09-30'), row(4, '2026-09-15', '2026-10-09'),
      row(5, '2026-09-10', '2026-09-29'), row(6, '2026-09-20', '2026-10-01', 'CANCELED'),
      row(7, '2026-09-30', '2026-10-01')]
    const sections = homeEventSections(rows, '2026-09-30')
    expect(sections.upcoming.map(event => event.id)).toEqual([2])
    expect(sections.closing.map(event => event.id)).toEqual([3, 7, 1])
  })

  it('loads enough upcoming records for the two home sections without changing result-page size', () => {
    const state = parseBrowse(new URLSearchParams('category=subculture&region=GYEONGGI'))
    const home = homeBrowseApiParams(state, '2026-09-30')
    expect(home.get('size')).toBe('100')
    expect(home.get('from')).toBe('2026-09-30')
    expect(home.get('region')).toBe('GYEONGGI')
  })

  it('requests recently published events separately while retaining category and region', () => {
    const state = parseBrowse(new URLSearchParams('category=exhibitions&region=SEOUL'))
    const query = homeRecentApiParams(state, '2026-09-30')
    expect(query.get('category')).toBe('EXHIBITION')
    expect(query.get('region')).toBe('SEOUL')
    expect(query.get('sort')).toBe('RECENT')
    expect(query.get('from')).toBe('2026-09-30')
    expect(query.get('size')).toBe('30')
  })

  it('shows the five newest distinct live publications, not the earliest event dates', () => {
    const published = (id: number, publishedAt: string, endDate = '2026-10-20', state = 'SCHEDULED') => ({
      ...row(id, '2026-10-01', endDate, state), publishedAt,
    })
    const rows = [published(1, '2026-09-20T00:00:00Z'), published(2, '2026-09-29T00:00:00Z'),
      published(3, '2026-09-28T00:00:00Z'), published(4, '2026-09-27T00:00:00Z'),
      published(5, '2026-09-26T00:00:00Z'), published(6, '2026-09-25T00:00:00Z'),
      published(2, '2026-09-22T00:00:00Z'), published(7, '2026-09-30T00:00:00Z', '2026-09-29'),
      published(8, '2026-09-30T00:00:00Z', '2026-10-20', 'CANCELED')]
    expect(latestFeaturedEvents(rows, '2026-09-30').map(event => event.id)).toEqual([2, 3, 4, 5, 6])
  })
})

describe('parseBrowse', () => {
  it('rejects a subcategory that belongs to a different category', () => {
    const state = parseBrowse(new URLSearchParams('category=exhibitions&type=BIRTHDAY_CAFE&region=BUSAN&page=-1'))

    expect(state.category.key).toBe('exhibitions')
    expect(state.subcategory).toBe('')
    expect(state.region).toBe('')
    expect(state.page).toBe(0)
  })

  it('defaults missing periods to upcoming events', () => {
    expect(parseBrowse(new URLSearchParams('category=festivals')).period).toBe('upcoming')
  })
})

describe('periodRange', () => {
  it('returns the coming Saturday and Sunday from a weekday', () => {
    expect(periodRange('weekend', '2026-09-23')).toEqual({ from: '2026-09-26', to: '2026-09-27' })
  })

  it('returns the full next calendar month across a year boundary', () => {
    expect(periodRange('nextmonth', '2026-12-20')).toEqual({ from: '2027-01-01', to: '2027-01-31' })
  })
})

describe('event schedule presentation', () => {
  const splitClosingDay = [
    { startDate: '2026-09-30', endDate: '2026-10-01', startTime: '10:00', endTime: '17:00' },
    { startDate: '2026-10-02', endDate: '2026-10-02', startTime: '10:00', endTime: '16:00' },
  ]

  it('shows adjacent operating segments as one event date range in list cards', () => {
    expect(cardOccurrences(splitClosingDay, '2026-09-27', 'upcoming').shown)
      .toEqual([{ startDate: '2026-09-30', endDate: '2026-10-02', startTime: null, endTime: null }])
    expect(eventDateLabel(splitClosingDay)).toContain('10. 2.')
  })

  it('keeps different closing hours visible on the event detail', () => {
    expect(eventTimeLabels(splitClosingDay)).toEqual([
      '9. 30. (수) ~ 10. 1. (목) · 10:00 – 17:00',
      '10. 2. (금) · 10:00 – 16:00',
    ])
  })
})
