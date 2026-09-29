import test from 'node:test'
import assert from 'node:assert/strict'
import { CATEGORY_SITES, categoryRedirect, requestSiteOrigin, categoryHome } from './category-sites.mjs'
import { pageMetadata, renderCrawlableContent } from './metadata.mjs'
import { renderPage, createHandler } from '../api/page.mjs'
import { publishedEvents, renderSitemap, renderRobots } from './sitemap.mjs'

const template = '<html><head><!-- BOOTH_META_START --><!-- BOOTH_META_END --></head><body><div id="root"></div></body></html>'
const fixture = { id: 12, event: { name: '와인 박람회', subcategory: 'WINE', venueName: '전시장', occurrences: [{ startDate: '2026-10-01', endDate: '2026-10-03' }] }, participants: [{ id: 7, participant: { registrationName: '참가 브랜드' } }] }
const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })

test('only exact known hosts can control public origin', () => {
  assert.equal(requestSiteOrigin('expo.boothana.kr', 'https://boothana.kr'), CATEGORY_SITES.exhibitions.origin)
  for (const host of ['expo.boothana.kr.evil.test', 'evil.test', 'expo.boothana.kr:443', 'expo.boothana.kr/path', ['expo.boothana.kr']]) {
    assert.equal(requestSiteOrigin(host, 'https://boothana.kr'), 'https://boothana.kr')
  }
})
test('legacy URLs are unchanged until rollout and redirect without losing filters after rollout', () => {
  const request = { origin: 'https://boothana.kr', path: '/discover', search: 'category=exhibitions&q=와인' }
  assert.equal(categoryRedirect(request), '')
  assert.equal(categoryRedirect({ ...request, enabled: true }), 'https://expo.boothana.kr/discover?q=%EC%99%80%EC%9D%B8')
  assert.equal(categoryRedirect({ ...request, search: 'category=festivals', enabled: true }), 'https://festival.boothana.kr/')
  assert.equal(categoryRedirect({ origin: 'https://expo.boothana.kr', path: '/', search: '' }), '')
  assert.equal(categoryHome('exhibitions', 'https://expo.boothana.kr'), '/')
  assert.equal(categoryHome('festivals', 'https://expo.boothana.kr'), 'https://festival.boothana.kr/')
  for (const category of ['constructor', '__proto__', 'toString']) {
    assert.equal(categoryRedirect({ origin: 'https://expo.boothana.kr', path: '/', search: `category=${category}` }), '')
  }
})
test('each category home has its own website identity, canonical and crawlable heading', async () => {
  for (const [key, site] of Object.entries(CATEGORY_SITES)) {
    const seen = []
    const page = await renderPage({ path: '/', template, siteUrl: site.origin, apiBase: 'https://api.example', fetcher: async url => { seen.push(url); return json({ items: [], total: 0 }) } })
    assert.equal(page.status, 200)
    assert.equal(page.meta.canonical, `${site.origin}/`)
    assert.match(page.meta.title, new RegExp(site.label))
    assert.equal(page.meta.description, site.description)
    assert.match(page.meta.robots, /^index/)
    assert.equal(page.meta.schema['@graph'].find(node => node['@type'] === 'WebSite').name, site.name)
    assert.equal(seen.length, 1)
    assert.equal(new URL(seen[0]).searchParams.get('category'), site.code)
    assert.match(renderCrawlableContent({ path: '/', siteUrl: site.origin }), new RegExp(`<h1>${site.name}</h1>`))
    const filtered = pageMetadata({ path: '/discover', search: 'q=검색', siteUrl: site.origin })
    assert.match(filtered.robots, /^noindex/)
    assert.equal(filtered.canonical, `${site.origin}/`)
    assert.ok(key)
  }
})
test('event and booth wrong-domain requests redirect by public taxonomy, preserving visit context', async () => {
  for (const path of ['/discover/12', '/discover/12/booths/7']) {
    const page = await renderPage({ path, search: 'day=2026-10-01&view=map', template, siteUrl: 'https://festival.boothana.kr', apiBase: 'https://api.example', fetcher: async () => json(fixture) })
    assert.equal(page.status, 308)
    assert.equal(page.location, `https://expo.boothana.kr${path}?day=2026-10-01&view=map`)
    const own = await renderPage({ path, template, siteUrl: 'https://expo.boothana.kr', apiBase: 'https://api.example', fetcher: async () => json(fixture) })
    assert.equal(own.status, 200)
    assert.equal(own.meta.canonical, `https://expo.boothana.kr${path}`)
  }
  const missing = await renderPage({ path: '/discover/12/booths/99', template, siteUrl: 'https://festival.boothana.kr', apiBase: 'https://api.example', fetcher: async () => json(fixture) })
  assert.equal(missing.status, 404)
  assert.equal(missing.location, undefined)
})
test('category sitemap fetches only its own catalog and emits no duplicate category URLs', async () => {
  for (const [category, site] of Object.entries(CATEGORY_SITES)) {
    const seen = []
    const rows = await publishedEvents({ apiBase: 'https://api.example', category, fetcher: async url => { seen.push(url); return json({ items: [fixture], total: 1 }) } })
    assert.equal(seen.length, 1)
    assert.equal(new URL(seen[0]).searchParams.get('category'), site.code)
    const sitemap = renderSitemap(site.origin, rows)
    assert.equal((sitemap.match(/<loc>/g) || []).length, 2)
    assert.ok(sitemap.includes(`<loc>${site.origin}/discover/12</loc>`))
    assert.ok(!sitemap.includes('?category='))
    assert.ok(renderRobots(site.origin).includes(`${site.origin}/sitemap.xml`))
  }
})
test('portal exposes three crawlable destinations without duplicating category event feeds', async () => {
  const page = await renderPage({ path: '/', template, siteUrl: 'https://boothana.kr', splitSites: true, apiBase: 'https://api.example', fetcher: async () => { throw new Error('Portal must not fetch mixed feed') } })
  assert.equal(page.status, 200)
  const content = renderCrawlableContent({ path: '/', siteUrl: 'https://boothana.kr', splitSites: true })
  for (const site of Object.values(CATEGORY_SITES)) assert.ok(content.includes(`href="${site.origin}/"`))
  assert.ok(!renderSitemap('https://boothana.kr', [{ id: 12 }], true).includes('/discover/12'))
})
test('HTTP handler issues permanent redirect for category aliases including HEAD', async () => {
  const handler = createHandler(async () => template)
  for (const method of ['GET', 'HEAD']) {
    const headers = new Map()
    let body
    const res = { statusCode: 0, setHeader: (key, value) => headers.set(key, value), end: value => { body = value } }
    await handler({ method, headers: { host: 'expo.boothana.kr' }, url: '/discover?category=exhibitions', query: { path: '/discover' } }, res)
    assert.equal(res.statusCode, 308)
    assert.equal(headers.get('Location'), 'https://expo.boothana.kr/')
    assert.equal(body, undefined)
  }
})
