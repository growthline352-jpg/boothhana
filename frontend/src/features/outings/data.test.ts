import { afterEach, expect, it, vi } from 'vitest'
import type { PublicEventSummary } from '../catalog/api'
vi.mock('../../api/client', () => ({ publicRead: vi.fn() }))
vi.mock('../library/api', () => ({ libraryApi: { resolve: vi.fn() } }))
import { publicRead } from '../../api/client'
import { fromCatalog, loadCatalog } from './data'

afterEach(() => vi.clearAllMocks())
it('loads all three outing fields through the production API client, including popup', async () => {
  vi.mocked(publicRead).mockResolvedValue({ items: [], total: 0 })
  expect(await loadCatalog(new AbortController().signal)).toEqual({ places: [], limited: false })
  const calls = vi.mocked(publicRead).mock.calls.map(([path]) => new URL(path, 'https://api.example'))
  expect(calls.map(url => url.searchParams.get('category'))).toEqual(['POPUP', 'EXHIBITION', 'FESTIVAL'])
  expect(calls.every(url => url.searchParams.get('sort') === 'DATE_ASC' && /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('from')!))).toBe(true)
})
it('uses public taxonomy and keeps unknown hours and costs unknown', () => {
  const row = { id: 8, event: { name: '브랜드 팝업', subcategory: 'POPUP_RETAIL', region: 'SEOUL', description: '', subjects: [], sources: [], occurrences: [{ startDate: '2026-10-24', endDate: '2026-10-25', startTime: null, endTime: null }] } } as unknown as PublicEventSummary
  const place = fromCatalog(row)
  expect(place.kind).toBe('popup')
  expect(place.cost).toBeNull()
  expect(place.hours[0].open).toBeNull()
  expect(place.source).toBe('catalog')
})
