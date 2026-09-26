import { describe, expect, it } from 'vitest'
import { parseBrowse, periodRange } from './browse'

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
