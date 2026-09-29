import { afterEach, describe, expect, it, vi } from 'vitest'
import { categoryHref, activeCategory, safeEventReturnTo } from './categories'
import { parseBrowse, browseApiParams } from './browse'
import { categorySitesActive } from './site'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
describe('category site routing', () => {
  it('returns a booth to its own event without losing map and visit context', () => {
    const fallback = '/discover/1?day=2026-10-03'
    const previous = '/discover/1?day=2026-10-03&view=map&focus=43'
    expect(safeEventReturnTo(previous, '1', fallback)).toBe(previous)
    for (const invalid of [null, '/', '/discover/2', '//evil.test/discover/1', 'https://evil.test/discover/1', 'javascript:alert(1)', '/discover/1/booths/43']) {
      expect(safeEventReturnTo(invalid, '1', fallback)).toBe(fallback)
    }
  })
  it.each([
    ['subculture.boothana.kr', 'subculture', 'SUBCULTURE'],
    ['expo.boothana.kr', 'exhibitions', 'EXHIBITION'],
    ['festival.boothana.kr', 'festivals', 'FESTIVAL'],
  ])('locks %s to its own category feed', (host, category, code) => {
    vi.stubGlobal('window', { location: { host } })
    const state = parseBrowse(new URLSearchParams('category=subculture'))
    expect(state.category.key).toBe(category)
    expect(browseApiParams(state, '2026-09-29').get('category')).toBe(code)
    expect(activeCategory('/', '')).toBe(category)
    expect(categorySitesActive()).toBe(true)
    expect(categoryHref(state.category.key)).toBe('/')
  })
  it('cross-category navigation uses an actual external hostname', () => {
    vi.stubGlobal('window', { location: { host: 'expo.boothana.kr' } })
    expect(categoryHref('festivals')).toBe('https://festival.boothana.kr/')
  })
  it('keeps old navigation until the explicit rollout flag is enabled', () => {
    vi.stubGlobal('window', { location: { host: 'boothana.kr' } })
    vi.stubEnv('VITE_CATEGORY_SITES_ENABLED', 'false')
    expect(categoryHref('festivals')).toBe('/discover?category=festivals')
    vi.stubEnv('VITE_CATEGORY_SITES_ENABLED', 'true')
    expect(categoryHref('festivals')).toBe('https://festival.boothana.kr/')
    expect(activeCategory('/', '')).toBeNull()
  })
})
