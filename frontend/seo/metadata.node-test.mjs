import test from 'node:test'
import assert from 'node:assert/strict'
import { pageMetadata, renderCrawlableContent, renderMetadata } from './metadata.mjs'
import { renderPage } from '../api/page.mjs'

const siteUrl = 'https://boothhana.example'
const participant = {
  id: 26,
  participant: { registrationName: 'Hio Doll <공식>', subjects: ['인형'] },
  sales: { summary: '행사 공개 판매 상품', subjects: ['구체관절인형'], categories: [], products: [{ name: '달 토끼 & 한정' }] },
  productRows: [{ data: { name: '달 토끼 & 한정' } }],
}
const catalog = {
  id: 13,
  event: {
    name: '41회 서울 프로젝트돌', description: '인형과 소품을 만나는 행사', subcategory: 'DOLL', organizer: '프로젝트돌', region: 'SEOUL',
    venueName: '세텍', address: '서울특별시 강남구 남부순환로 3104', admission: '유료', subjects: ['인형'],
    operationStatus: { state: 'SCHEDULED' }, occurrences: [{ startDate: '2026-09-30', endDate: '2026-09-30', startTime: '11:00', endTime: '17:00' }],
  },
  banner: { url: 'https://cdn.example/event.jpg' }, participants: [participant],
  assets: [{ type: 'BOOTH_CUT', participantId: 26, url: 'https://cdn.example/booth.jpg' }],
}
const listing = [{ id: 13, name: '41회 서울 프로젝트돌', venue: '세텍', startDate: '2026-09-30', urlPath: '/discover/13' }]

test('D.Festa Sunday event URL redirects to its combined event while booth URLs stay separate', async () => {
  const template = '<html><head></head><body></body></html>'
  const sunday = await renderPage({ path: '/discover/7', template, siteUrl, apiBase: 'https://api.example' })
  assert.equal(sunday.status, 308)
  assert.equal(sunday.location, `${siteUrl}/discover/1?day=2026-10-04`)
  const oldBooth = await renderPage({ path: '/discover/7', search: 'day=2026-10-04&booth=2751', template, siteUrl, apiBase: 'https://api.example' })
  assert.equal(oldBooth.location, `${siteUrl}/discover/7/booths/2751?day=2026-10-04`)
})

test('home and discovery have distinct titles and crawlable ItemList event links', () => {
  const home = pageMetadata({ path: '/', siteUrl, listing })
  const discover = pageMetadata({ path: '/discover', siteUrl, listing })
  assert.notEqual(home.title, discover.title)
  assert.ok(discover.schema['@graph'].some(node => node['@type'] === 'ItemList'))
  const content = renderCrawlableContent({ path: '/discover', listing })
  assert.match(content, /href="\/discover\/13"/)
  assert.match(content, /41회 서울 프로젝트돌/)
})

test('filtered browse views are noindex and point at the stable category URL', () => {
  const meta = pageMetadata({ path: '/discover', search: 'category=exhibitions&q=wine&page=2', siteUrl })
  assert.equal(meta.robots, 'noindex,follow')
  assert.equal(meta.canonical, `${siteUrl}/discover?category=exhibitions`)
})

test('event pages expose Event and BreadcrumbList structured data from public fields', () => {
  const meta = pageMetadata({ path: '/discover/13', siteUrl, catalog })
  assert.match(meta.robots, /^index,follow/)
  const graph = meta.schema['@graph']
  const event = graph.find(node => node['@type'] === 'Event')
  assert.equal(event.name, catalog.event.name)
  assert.equal(event.startDate, '2026-09-30T11:00:00+09:00')
  assert.equal(event.location.address.addressCountry, 'KR')
  assert.ok(graph.some(node => node['@type'] === 'BreadcrumbList'))
})

test('booth pages have their own canonical metadata and crawlable product content', () => {
  const path = '/discover/13/booths/26'
  const meta = pageMetadata({ path, siteUrl, catalog, participant })
  assert.match(meta.title, /Hio Doll/)
  assert.equal(meta.canonical, `${siteUrl}${path}`)
  assert.ok(meta.schema['@graph'].some(node => node['@id'] === `${siteUrl}${path}#booth`))
  assert.ok(meta.schema['@graph'].some(node => node['@type'] === 'Event'))
  const content = renderCrawlableContent({ path, catalog, participant })
  assert.match(content, /달 토끼 &amp; 한정/)
  assert.doesNotMatch(content, /달 토끼 & 한정/)
})

test('structured metadata is script-safe', () => {
  const hostile = structuredClone(catalog)
  hostile.event.name = '</script><script>alert(1)</script>'
  hostile.event.description = '참가 규모 < 500 & 공개 행사'
  const output = renderMetadata(pageMetadata({ path: '/discover/13', siteUrl, catalog: hostile }))
  assert.doesNotMatch(output, /<script>alert/)
  assert.match(output, /\\u003c/)
})

test('Google ownership verification accepts only the issued token format', () => {
  const token = 'google_verification-token_1234567890'
  const valid = renderMetadata(pageMetadata({ path: '/', siteUrl, verification: token }))
  assert.match(valid, new RegExp(`name="google-site-verification" content="${token}"`))
  const invalid = renderMetadata(pageMetadata({ path: '/', siteUrl, verification: '<script>alert(1)</script>' }))
  assert.doesNotMatch(invalid, /google-site-verification/)
})

test('server renderer resolves a public booth and returns 404 for an unknown booth', async () => {
  const template = '<!-- BOOTH_META_START --><!-- BOOTH_META_END --><div id="root"></div>'
  const fetcher = async () => new Response(JSON.stringify(catalog), { status: 200, headers: { 'content-type': 'application/json' } })
  const found = await renderPage({ path: '/discover/13/booths/26', template, siteUrl, apiBase: 'https://api.example', fetcher })
  assert.equal(found.status, 200)
  assert.match(found.html, /data-seo-fallback/)
  const missing = await renderPage({ path: '/discover/13/booths/999', template, siteUrl, apiBase: 'https://api.example', fetcher })
  assert.equal(missing.status, 404)
  assert.equal(missing.meta.robots, 'noindex,follow')
})

test('server renderer adds best-effort crawlable browse content without failing when listing API is unavailable', async () => {
  const template = '<!-- BOOTH_META_START --><!-- BOOTH_META_END --><div id="root"></div>'
  const ok = async () => new Response(JSON.stringify({ items: listing.map(row => ({ id: row.id, event: { name: row.name, venueName: row.venue, occurrences: [{ startDate: row.startDate, endDate: row.startDate }] } })) }), { status: 200, headers: { 'content-type': 'application/json' } })
  const rendered = await renderPage({ path: '/discover', template, siteUrl, apiBase: 'https://api.example', fetcher: ok })
  assert.equal(rendered.status, 200)
  assert.match(rendered.html, /href="\/discover\/13"/)
  const unavailable = await renderPage({ path: '/discover', template, siteUrl, apiBase: 'https://api.example', fetcher: async () => new Response('', { status: 503 }) })
  assert.equal(unavailable.status, 200)
  assert.match(unavailable.html, /공개 행사 목록을 불러오고 있습니다/)
})
