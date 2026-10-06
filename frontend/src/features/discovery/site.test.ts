import { afterEach, describe, expect, it, vi } from 'vitest'
import { categoryHref, categoryEventHref, activeCategory, safeEventReturnTo, categoryForType } from './categories'
import { parseBrowse, browseApiParams } from './browse'
import { categorySitesActive, isLocalPreview } from './site'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
describe('category site routing', () => {
  it('keeps popup exploration highlighted as the popup field on root and category hosts',()=>{
    for(const host of ['boothana.kr','popup.boothana.kr']){
      vi.stubGlobal('window',{location:{host}})
      expect(activeCategory('/popups','')).toBe('popups')
      expect(activeCategory('/popups/','?neighborhood=SEONGSU')).toBe('popups')
    }
  })
  it('separates fandom popups and maps old popup filters to retail within the popup field', () => {
    for(const type of ['POPUP_STORE','POPUP_RETAIL','POPUP_EXPERIENCE','POPUP_EXHIBITION','POPUP_MIXED']) {
      expect(categoryForType(type).key).toBe('popups')
      expect(parseBrowse(new URLSearchParams(`category=subculture&type=${type}`)).subcategory).toBe('')
    }
    const legacy=parseBrowse(new URLSearchParams('category=popups&type=POPUP_STORE'))
    expect(browseApiParams(legacy,'2026-10-04').get('subcategory')).toBe('POPUP_RETAIL')
  })
  it('retains the corrected subculture format in browse filters and event routing', () => {
    for (const type of ['SUBCULTURE_MUSIC', 'ANIME_GAME_FESTIVAL', 'ART_BOOK', 'BOARD_GAME', 'CHARACTER_ART', 'ILLUSTRATION']) {
      const state = parseBrowse(new URLSearchParams(`category=subculture&type=${type}`))
      expect(browseApiParams(state, '2026-10-02').get('subcategory')).toBe(type)
      expect(categoryForType(type).key).toBe('subculture')
    }
    expect(categoryForType('MUSIC').key).toBe('festivals')
  })
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
  it('preserves the group route and selected venue when returning from a member booth',()=>{
    const fallback='/discover/102?day=2026-10-03'
    const previous='/discover/101?day=2026-10-03&operatingEvent=102&view=map&q=B1&my=saved&subject=GAME'
    expect(safeEventReturnTo(previous,'102',fallback,[101,102])).toBe(previous)
    expect(safeEventReturnTo(previous,'102',fallback)).toBe(fallback)
    expect(safeEventReturnTo(previous,'102',fallback,[101,103])).toBe(fallback)
  })
  it('does not expand the group return allowlist from URL parameters or external origins',()=>{
    const fallback='/discover/102?day=2026-10-03'
    for(const invalid of [
      '/discover/103?operatingEvent=102',
      '/discover/101/booths/43?operatingEvent=102',
      '//evil.test/discover/101',
      'https://evil.test/discover/101?operatingEvent=102',
      '/discover/0',
      '/discover/-1',
    ])expect(safeEventReturnTo(invalid,'102',fallback,[101,102,0,-1,NaN])).toBe(fallback)
  })
  it.each([
    ['subculture.boothana.kr', 'subculture', 'SUBCULTURE'],
    ['expo.boothana.kr', 'exhibitions', 'EXHIBITION'],
    ['festival.boothana.kr', 'festivals', 'FESTIVAL'],
    ['popup.boothana.kr', 'popups', 'POPUP'],
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
