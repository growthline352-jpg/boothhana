import { describe, expect, it } from 'vitest'
import type { PopularEventSummary } from '../catalog/api'
import { rankedPopularEvents } from './popular'

const row = (id: number, name: string, saveCount: number, publishedAt = '2026-09-29T00:00:00Z'): PopularEventSummary => ({
  id, saveCount, publishedAt, participantCount: 0,
  event: { name, subcategory: 'ONLY_EVENT', organizer: null, edition: null, region: 'SEOUL', venueName: null,
    address: null, description: '', admission: null, subjects: [], occurrences: [], sources: [], banners: [], warnings: [] },
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
