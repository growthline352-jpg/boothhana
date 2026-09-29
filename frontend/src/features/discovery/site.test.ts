import { afterEach, describe, expect, it, vi } from 'vitest'
import { categoryHref, activeCategory } from './categories'
import { parseBrowse, browseApiParams } from './browse'
import { categorySitesActive } from './site'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
describe('category site routing', () => {
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
