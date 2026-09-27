import { describe, expect, it } from 'vitest'
import { cardOccurrences, eventDateLabel, eventTimeLabels, isDiscoveryResults, parseBrowse, periodRange, searchResultsHref } from './browse'

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
