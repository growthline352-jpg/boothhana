import test from 'node:test'
import assert from 'node:assert/strict'
import { pageMetadata, renderCrawlableContent, renderMetadata } from './metadata.mjs'
import { renderPage } from '../api/page.mjs'

const siteUrl = 'https://boothhana.example'
const participant = {
  id: 26,
  participant: { registrationName: 'Hio Doll <공식>', subjects: ['인형'], members: [{ name: '달토끼' }], locations: [{ status: 'ASSIGNED', code: 'I-20', hall: '1관', startDate: '2026-09-30', endDate: '2026-09-30' }], officialLinks: ['https://circle.example/info', 'javascript:alert(1)'] },
  sales: { summary: '행사 공개 판매 상품', subjects: ['구체관절인형'], categories: [], products: [{ name: '달 토끼 & 한정' }] },
  productRows: [{ data: { name: '달 토끼 & 한정', evidenceScope: 'EVENT_SALE_CONFIRMED' } }],
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
  assert.match(content, /부스 I-20/)
  assert.match(content, /참가자: 달토끼/)
  assert.match(content, /https:\/\/circle.example\/info/)
  assert.doesNotMatch(content, /javascript:/)
  assert.match(meta.description, /I-20/)
  assert.match(meta.description, /2026-09-30/)
})

test('ended event records lead to upcoming events without changing their canonical or marking the next edition as confirmed', () => {
  const options = { path: '/discover/13', catalog, siteUrl: 'https://subculture.boothana.kr' }
  const past = renderCrawlableContent({ ...options, day: '2026-10-22' })
  assert.match(past, /다음에 갈 곳/)
  assert.match(past, /period=upcoming/)
  assert.match(past, /region=SEOUL/)
  assert.match(past, /다음 회차의 일정·참가 정보는 별도로 확인/)
  assert.equal(pageMetadata(options).canonical, 'https://subculture.boothana.kr/discover/13')
  assert.doesNotMatch(renderCrawlableContent({ ...options, day: '2026-09-30' }), /다음에 갈 곳/)
  const multiDay = structuredClone(catalog)
  multiDay.event.occurrences.push({ startDate: '2026-10-24', endDate: '2026-10-25' })
  const ongoing = renderCrawlableContent({ ...options, catalog: multiDay, day: '2026-10-22' })
  assert.doesNotMatch(ongoing, /다음에 갈 곳/)
  assert.match(ongoing, /2026-10-24 ~ 2026-10-25/)
  assert.match(ongoing, /운영시간 미확인/)
})

test('booth fallback does not present profile or past-reference products as current event merchandise', () => {
  const profile = structuredClone(participant)
  profile.productRows[0].data.evidenceScope = 'PROFILE'
  const content = renderCrawlableContent({ path: '/discover/13/booths/26', catalog, participant: profile })
  assert.doesNotMatch(content, /달 토끼 &amp; 한정/)
  assert.match(content, /이번 행사에서 판매한다고 공개 확인된 상품은 아직 없습니다/)
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

test('default crawlable feeds request upcoming events by date rather than recently republished past events', async () => {
  const seen = []
  await renderPage({ path: '/discover', template: '<!-- BOOTH_META_START --><!-- BOOTH_META_END --><div id="root"></div>', siteUrl, apiBase: 'https://api.example', fetcher: async url => {
    seen.push(new URL(url))
    return new Response(JSON.stringify({ items: [] }), { headers: { 'content-type': 'application/json' } })
  } })
  assert.equal(seen.length, 1)
  assert.equal(seen[0].searchParams.get('sort'), 'DATE_ASC')
  assert.match(seen[0].searchParams.get('from'), /^\d{4}-\d{2}-\d{2}$/)
})

test('the two DFesta days share one canonical event URL and server-rendered date span', async () => {
  const template = '<!-- BOOTH_META_START --><!-- BOOTH_META_END --><div id="root"></div>'
  const saturday = { ...catalog, id: 1, event: { ...catalog.event, name: '제35회 디. 페스타 (토요일)', occurrences: [{ startDate:'2026-10-03',endDate:'2026-10-03',startTime:'11:00',endTime:'16:00' }] } }
  const sunday = { ...catalog, id: 7, event: { ...catalog.event, name: '제35회 디. 페스타 (일요일)', occurrences: [{ startDate:'2026-10-04',endDate:'2026-10-04',startTime:'11:00',endTime:'16:00' }] } }
  const fetcher = async url => new Response(JSON.stringify(url.endsWith('/7') ? sunday : saturday), { status:200, headers:{'content-type':'application/json'} })
  const oldUrl = await renderPage({ path:'/discover/7', template, siteUrl, apiBase:'https://api.example', fetcher })
  assert.equal(oldUrl.status, 308)
  assert.equal(oldUrl.location, `${siteUrl}/discover/1?day=2026-10-04`)
  const merged = await renderPage({ path:'/discover/1', template, siteUrl, apiBase:'https://api.example', fetcher })
  assert.equal(merged.status, 200)
  assert.match(merged.html, /제35회 디\. 페스타/)
  assert.match(merged.html, /2026-10-03 ~ 2026-10-04/)
  assert.equal(merged.meta.canonical, `${siteUrl}/discover/1`)
})
