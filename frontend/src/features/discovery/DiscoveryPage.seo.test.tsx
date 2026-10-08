import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({ hostCategory: '', total: 47 }))
vi.mock('../../app/useRemote', () => ({ useRemote: () => ({ data: { items: [], total: fixture.total }, loading: false, error: null, reload: vi.fn() }) }))
vi.mock('../../app/useAuth', () => ({ useAuth: () => ({ status: 'anonymous', user: null }) }))
vi.mock('./useRecommendationViewer', () => ({ useRecommendationViewer: () => 'anonymous' }))
vi.mock('../visit/ScrollMemory', () => ({ usePageScroll: () => {} }))
vi.mock('./site', async original => ({
  ...await original<typeof import('./site')>(),
  currentSiteCategory: () => fixture.hostCategory || null,
  currentSiteOrigin: () => (({ popups: 'https://popup.boothana.kr', subculture: 'https://subculture.boothana.kr', exhibitions: 'https://expo.boothana.kr', festivals: 'https://festival.boothana.kr' } as Record<string, string>)[fixture.hostCategory] || 'https://boothana.kr'),
  categorySitesActive: () => Boolean(fixture.hostCategory),
  isLocalPreview: () => false,
}))
import { DiscoveryPage } from './DiscoveryPage'
import { pageMetadata } from '../../../seo/metadata.mjs'
import { CATEGORY_SITES } from '../../../seo/category-sites.mjs'

const render = (url: string) => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [url] }, createElement(DiscoveryPage)))
const decode = (href: string) => href.replaceAll('&amp;', '&')
function classHref(html: string, className: string) {
  const found = html.match(new RegExp(`<a[^>]*class="[^"]*${className}[^"]*"[^>]*href="([^"]+)"`))
  expect(found).not.toBeNull()
  return new URL(decode(found![1]), 'https://boothana.kr')
}
function pageHref(html: string, rel: string) {
  const pagination = html.match(/<nav class="discovery-pagination"[\s\S]*?<\/nav>/)?.[0]
  expect(pagination).toBeDefined()
  const found = pagination!.match(new RegExp(`<a[^>]*rel="${rel}"[^>]*href="([^"]+)"`))
  expect(found).not.toBeNull()
  return new URL(decode(found![1]), 'https://boothana.kr')
}
beforeEach(() => { fixture.hostCategory = ''; fixture.total = 47 })

it('renders a complete directory anchor while the independent calendar anchor preserves selected home region', () => {
  const html = render('/?category=subculture&region=SEOUL')
  const directory = classHref(html, 'daily-note-more')
  expect(directory.pathname).toBe('/discover')
  expect(directory.searchParams.get('period')).toBe('all')
  expect(directory.searchParams.get('sort')).toBe('recent')
  expect(directory.searchParams.has('region')).toBe(false)
  const calendar = classHref(html, 'discovery-calendar-link')
  expect(calendar.searchParams.get('view')).toBe('calendar')
  expect(calendar.searchParams.get('period')).toBe('all')
  expect(calendar.searchParams.get('region')).toBe('SEOUL')
})

it('renders crawlable complete-directory links and self-canonical pagination on every category host', () => {
  for (const [category, site] of Object.entries(CATEGORY_SITES)) {
    fixture.hostCategory = category
    const home = render('/?region=GYEONGGI')
    const directory = classHref(home, 'daily-note-more')
    expect(directory.searchParams.has('category')).toBe(false)
    expect(directory.searchParams.has('region')).toBe(false)
    expect(classHref(home, 'discovery-calendar-link').searchParams.get('region')).toBe('GYEONGGI')
    const html = render(directory.pathname + directory.search)
    const next = pageHref(html, 'next')
    expect(next.searchParams.get('page')).toBe('1')
    expect(next.searchParams.get('period')).toBe('all')
    expect(next.searchParams.get('sort')).toBe('recent')
    expect(next.searchParams.has('category')).toBe(false)
    const meta = pageMetadata({ path: next.pathname, search: next.search, siteUrl: site.origin })
    expect(meta.robots).toMatch(/^index/)
    expect(meta.canonical).toBe(site.origin + '/discover?period=all&sort=recent&page=1')
  }
})

it('pagination anchors preserve the active search and filters and remove page=0 from the previous URL', () => {
  const html = render('/discover?category=exhibitions&view=results&period=weekend&sort=recent&region=SEOUL&q=와인&type=WINE&page=1')
  for (const [rel, page] of [['prev', null], ['next', '2']] as const) {
    const url = pageHref(html, rel)
    expect(url.searchParams.get('page')).toBe(page)
    expect(url.searchParams.get('category')).toBe('exhibitions')
    expect(url.searchParams.get('period')).toBe('weekend')
    expect(url.searchParams.get('region')).toBe('SEOUL')
    expect(url.searchParams.get('q')).toBe('와인')
    expect(url.searchParams.get('type')).toBe('WINE')
  }
})
