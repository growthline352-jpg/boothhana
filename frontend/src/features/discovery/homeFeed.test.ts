import { describe, expect, it, vi } from 'vitest'
import type { Page, PublicEventSummary } from '../catalog/api'
import { homeBrowseApiParams, isDiscoveryResults, parseBrowse } from './browse'
import { HomeFeed, homeSectionHref, homeSectionRegion } from './homeFeed'
import { pageScrollKey } from '../visit/scrollKey'

const page = (total: number): Page<PublicEventSummary> => ({ items: [], page: 0, size: 100, total })
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

describe('page-owned home feed', () => {
  it('shares one initial request across the daily note and both sections, then reuses completed regional results', async () => {
    const pending = deferred<Page<PublicEventSummary>>()
    const load = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(page(2))
    const feed = new HomeFeed(load)
    const first = feed.load('all')
    expect(feed.load('all')).toBe(first)
    expect(feed.load('all')).toBe(first)
    await Promise.resolve()
    expect(load).toHaveBeenCalledTimes(1)
    expect(feed.peek('all')).toBeUndefined()
    const value = page(3)
    pending.resolve(value); await first
    expect(feed.peek('all')).toBe(value)
    await feed.load('seoul')
    expect(feed.load('all')).toBe(first)
    expect(feed.peek('all')).toBe(value)
    await feed.load('seoul')
    expect(load.mock.calls).toEqual([['all'], ['seoul']])
  })

  it('removes failed requests so retry is possible and keeps late responses under their own query', async () => {
    const slow = deferred<Page<PublicEventSummary>>()
    const failed = deferred<Page<PublicEventSummary>>()
    const load = vi.fn().mockReturnValueOnce(slow.promise).mockReturnValueOnce(failed.promise).mockResolvedValue(page(9))
    const feed = new HomeFeed(load)
    const all = feed.load('all'), seoul = feed.load('seoul')
    const rejection = expect(seoul).rejects.toThrow('offline')
    failed.reject(new Error('offline')); await rejection
    expect(feed.peek('seoul')).toBeUndefined()
    await feed.load('seoul')
    slow.resolve(page(1)); await all
    expect(feed.peek('all')?.total).toBe(1)
    expect(feed.peek('seoul')?.total).toBe(9)
    expect(load).toHaveBeenCalledTimes(3)
  })

  it('does not share data with another mounted page/category/day cache', async () => {
    const load = vi.fn().mockResolvedValue(page(1))
    const first = new HomeFeed(load), next = new HomeFeed(load)
    await first.load('all')
    expect(next.peek('all')).toBeUndefined()
    await next.load('all')
    expect(load).toHaveBeenCalledTimes(2)
  })
})

describe('regional home section queries', () => {
  it('keeps the scroll position for home section tabs on root and discovery routes', () => {
    expect(pageScrollKey('/', '')).toBe(pageScrollKey('/', '?openingRegion=SEOUL&closingRegion=GYEONGGI'))
    expect(pageScrollKey('/discover', '?category=subculture')).toBe(pageScrollKey('/discover', '?openingRegion=SEOUL&category=subculture&closingRegion=GYEONGGI'))
    expect(pageScrollKey('/discover', '?category=subculture&region=SEOUL')).not.toBe(pageScrollKey('/discover', '?category=subculture&region=GYEONGGI'))
    expect(pageScrollKey('/discover', '?view=results&page=2')).toBe('/discover?view=results&page=2')
  })

  it('applies the selected region before the server limit rather than filtering the first 100 global rows', () => {
    const state = parseBrowse(new URLSearchParams('category=subculture&region=SEOUL&areas=HONGDAE'))
    const query = homeBrowseApiParams({ ...state, region: 'GYEONGGI', areas: '' }, '2026-10-04')
    expect(query.get('region')).toBe('GYEONGGI')
    expect(query.get('size')).toBe('100')
    expect(query.get('from')).toBe('2026-10-04')
    expect(query.has('areas')).toBe(false)
  })

  it('normalizes invalid section regions and preserves the landing view', () => {
    const params = new URLSearchParams('category=subculture&openingRegion=SEOUL&closingRegion=invalid')
    expect(homeSectionRegion(params, 'openingRegion')).toBe('SEOUL')
    expect(homeSectionRegion(params, 'closingRegion')).toBe('')
    expect(isDiscoveryResults('/discover', params)).toBe(false)
    const href = homeSectionHref(params, 'subculture', '')
    const results = new URL(href, 'https://boothana.kr').searchParams
    expect(results.has('region')).toBe(false)
    expect(results.has('openingRegion')).toBe(false)
    expect(results.has('closingRegion')).toBe(false)
    expect(isDiscoveryResults('/discover', results)).toBe(true)
    expect(params.get('openingRegion')).toBe('SEOUL')
  })
})
