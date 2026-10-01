import { afterEach, describe, expect, it, vi } from 'vitest'
import { categoryHref, categoryEventHref, activeCategory, safeEventReturnTo } from './categories'
import { parseBrowse, browseApiParams } from './browse'
import { categorySitesActive, isLocalPreview } from './site'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
describe('category site routing', () => {
  it('keeps local category homes on the local preview while production links stay split', () => {
    vi.stubGlobal('window', { location: { host: '127.0.0.1:4184' } })
    vi.stubEnv('VITE_PUBLIC_SITE_URL', 'https://boothana.kr')
    vi.stubEnv('VITE_CATEGORY_SITES_ENABLED', 'true')
    expect(isLocalPreview()).toBe(true)
    expect(categoryHref('subculture')).toBe('/?category=subculture')
    expect(categoryHref('exhibitions')).toBe('/?category=exhibitions')
    expect(categoryHref('festivals')).toBe('/?category=festivals')
    expect(categoryEventHref('festivals', 42)).toBe('/discover/42')
    vi.stubGlobal('window', { location: { host: 'boothana.kr' } })
    expect(isLocalPreview()).toBe(false)
    expect(categoryHref('exhibitions')).toBe('https://expo.boothana.kr/')
    expect(categoryEventHref('exhibitions', 42)).toBe('https://expo.boothana.kr/discover/42')
  })
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
    expect(categoryEventHref('festivals', 42)).toBe('/discover/42')
    vi.stubEnv('VITE_CATEGORY_SITES_ENABLED', 'true')
    expect(categoryHref('festivals')).toBe('https://festival.boothana.kr/')
    expect(activeCategory('/', '')).toBeNull()
  })
})
