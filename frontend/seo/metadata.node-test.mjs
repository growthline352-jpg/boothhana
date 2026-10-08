import test from 'node:test'
import assert from 'node:assert/strict'
import { pageMetadata, renderCrawlableContent, renderMetadata } from './metadata.mjs'
import { renderPage } from '../api/page.mjs'
import { naverVerificationFor } from './naver-verification.mjs'

const siteUrl = 'https://boothhana.example'
test('comparison and neighborhood utilities stay noindex and have public feature titles',()=>{
 for(const [path,title] of [['/compare','행사 비교'],['/popups','동네 팝업']]){
  const meta=pageMetadata({path,search:'?ids=1,2',siteUrl});assert.ok(meta.title.includes(title));assert.equal(meta.robots,'noindex,follow');assert.equal(meta.schema,null)
 }
 const legacy=pageMetadata({path:'/discover',search:'?category=popups',siteUrl,splitSites:false});assert.ok(legacy.title.includes('팝업'));assert.ok(!legacy.title.includes('축제'))
})

test('subculture performances and fairs have a subculture canonical on split sites', () => {
  for (const subcategory of ['SUBCULTURE_MUSIC', 'ANIME_GAME_FESTIVAL', 'ART_BOOK', 'BOARD_GAME', 'CHARACTER_ART', 'ILLUSTRATION', 'FAN_CAFE', 'CARD_COLLECTIBLES', 'FAN_CONVENTION']) {
    const meta = pageMetadata({ path: '/discover/240', siteUrl: 'https://festival.boothana.kr', splitSites: true,
      catalog: { ...catalog, id: 240, event: { ...catalog.event, subcategory } } })
    assert.equal(meta.canonical, 'https://subculture.boothana.kr/discover/240')
  }
})
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

test('Naver ownership verification is unique to each registered host', () => {
  const origins = ['https://boothana.kr', 'https://subculture.boothana.kr', 'https://expo.boothana.kr', 'https://festival.boothana.kr']
  const tags = origins.map(origin => renderMetadata(pageMetadata({ path: '/', siteUrl: origin, naverVerification: naverVerificationFor(origin) })))
  assert.equal(new Set(tags.map(tag => tag.match(/name="naver-site-verification" content="([^"]+)"/)?.[1])).size, 4)
  assert.ok(tags.every(tag => tag.includes('name="naver-site-verification"')))
  assert.equal(naverVerificationFor('https://boothhana.vercel.app'), '')
  const invalid = renderMetadata(pageMetadata({ path: '/', siteUrl, naverVerification: '<script>alert(1)</script>' }))
  assert.doesNotMatch(invalid, /naver-site-verification/)
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

test('server renderer returns a retryable error instead of an indexable empty listing when the API is unavailable', async () => {
  const template = '<!-- BOOTH_META_START --><!-- BOOTH_META_END --><div id="root"></div>'
  const ok = async () => new Response(JSON.stringify({ total: 1, items: listing.map(row => ({ id: row.id, event: { name: row.name, venueName: row.venue, occurrences: [{ startDate: row.startDate, endDate: row.startDate }] } })) }), { status: 200, headers: { 'content-type': 'application/json' } })
  const rendered = await renderPage({ path: '/discover', template, siteUrl, apiBase: 'https://api.example', fetcher: ok })
  assert.equal(rendered.status, 200)
  assert.match(rendered.html, /href="\/discover\/13"/)
  const unavailable = await renderPage({ path: '/discover', template, siteUrl, apiBase: 'https://api.example', fetcher: async () => new Response('', { status: 503 }) })
  assert.equal(unavailable.status, 503)
  assert.equal(unavailable.meta.robots, 'noindex,follow')
  assert.doesNotMatch(unavailable.html, /공개 행사 목록을 불러오고 있습니다/)
})

const browseTemplate = '<!-- BOOTH_META_START --><!-- BOOTH_META_END --><div id="root"></div>'
const publicJson = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })
const directorySearch = 'period=all&sort=recent'

test('unfiltered all-period directory pages have independent indexable canonical URLs', () => {
  for (const origin of ['https://subculture.boothana.kr', 'https://expo.boothana.kr', 'https://festival.boothana.kr', 'https://popup.boothana.kr']) {
  for (const page of [0, 1, 2]) {
    const meta = pageMetadata({ path: '/discover', siteUrl: origin, search: `${directorySearch}&page=${page}` })
    assert.match(meta.robots, /^index,follow/)
    assert.equal(meta.canonical, `${origin}/discover?${directorySearch}${page ? `&page=${page}` : ''}`)
    if (page) assert.match(meta.title, new RegExp(`${page + 1}페이지`))
  }
  for (const extra of ['&q=인형', '&region=SEOUL', '&type=DOLL', '&page=-1', '&page=1&page=2']) {
    assert.equal(pageMetadata({ path: '/discover', siteUrl: origin, search: directorySearch + extra }).robots, 'noindex,follow')
  }
  }
})

test('crawlers can follow HTML links from the category home through every directory page', async () => {
  const origin = 'https://subculture.boothana.kr'
  const events = Array.from({ length: 47 }, (_, i) => ({ id: 150 + i, event: { name: `공개 행사 ${150 + i}`, venueName: '서울', occurrences: [] } }))
  const fetcher = async (url, options) => {
    assert.equal(options.credentials, 'omit')
    assert.equal(options.redirect, 'error')
    const params = new URL(url).searchParams
    assert.equal(params.get('grouped'), 'true', 'HTML and browser listings must paginate the same operating editions')
    const page = Number(params.get('page')), size = Number(params.get('size'))
    return publicJson({ total: events.length, page, size, items: events.slice(page * size, (page + 1) * size) })
  }
  const render = url => renderPage({ path: url.pathname, search: url.search.slice(1), template: browseTemplate, siteUrl: origin, apiBase: 'https://api.example', fetcher })
  const home = await render(new URL('/', origin))
  const directoryHref = home.html.match(/href="([^"]+)"[^>]*>전체 행사 보기/)
  assert.ok(directoryHref, 'the home must link to the complete event directory')
  let url = new URL(directoryHref[1].replaceAll('&amp;', '&'), origin)
  const visited = new Set(), found = new Set()
  while (!visited.has(url.href)) {
    visited.add(url.href)
    const page = await render(url)
    assert.equal(page.status, 200)
    assert.match(page.meta.robots, /^index/)
    assert.equal(page.meta.canonical, url.href)
    for (const match of page.html.matchAll(/<a href="\/discover\/(\d+)"/g)) found.add(Number(match[1]))
    const next = page.html.match(/<a href="([^"]+)" rel="next"/)
    if (!next) break
    url = new URL(next[1].replaceAll('&amp;', '&'), origin)
    assert.ok(visited.size < 5, 'pagination must not loop')
  }
  assert.equal(visited.size, 3)
  assert.deepEqual([...found].sort((a, b) => a - b), events.map(row => row.id))
})

test('listing responses slower than 1.5 seconds still contain the public event links', async () => {
  const fetcher = (url, { signal }) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(publicJson({ total: 1, items: [catalog] })), 1700)
    signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason) }, { once: true })
  })
  const page = await renderPage({ path: '/', template: browseTemplate, siteUrl, apiBase: 'https://api.example', fetcher })
  assert.equal(page.status, 200)
  assert.match(page.html, /href="\/discover\/13"/)
})

test('a transient public API failure is retried once without replacing content with an empty page', async () => {
  let calls = 0
  const fetcher = async () => ++calls === 1 ? new Response('', { status: 503 }) : publicJson({ total: 1, items: [catalog] })
  const page = await renderPage({ path: '/discover', search: directorySearch, template: browseTemplate, siteUrl, apiBase: 'https://api.example', fetcher })
  assert.equal(calls, 2)
  assert.equal(page.status, 200)
  assert.match(page.html, /href="\/discover\/13"/)
})

test('a nonexistent directory page returns 404 and invalid pagination cannot trigger an API fetch', async () => {
  const input = { path: '/discover', template: browseTemplate, siteUrl, apiBase: 'https://api.example' }
  const beyond = await renderPage({ ...input, search: directorySearch + '&page=2', fetcher: async () => publicJson({ total: 1, items: [] }) })
  assert.equal(beyond.status, 404)
  assert.equal(beyond.meta.robots, 'noindex,follow')
  let calls = 0
  const invalid = await renderPage({ ...input, search: directorySearch + '&page=100001', fetcher: async () => { calls++; return publicJson({ total: 0, items: [] }) } })
  assert.equal(calls, 0)
  assert.equal(invalid.meta.robots, 'noindex,follow')
})

test('an empty published catalog is distinguished from an unavailable API', async () => {
  const page = await renderPage({ path: '/discover', search: directorySearch, template: browseTemplate, siteUrl, apiBase: 'https://api.example', fetcher: async () => publicJson({ total: 0, items: [] }) })
  assert.equal(page.status, 200)
  assert.match(page.html, /현재 공개된 행사가 없습니다/)
  assert.doesNotMatch(page.html, /rel="next"/)
})

test('persistent server failures are bounded and all public listing failures stay noindex', async () => {
  for (const path of ['/discover', '/events']) {
    let calls = 0
    const page = await renderPage({ path, template: browseTemplate, siteUrl, apiBase: 'https://api.example',
      fetcher: async () => { calls++; return new Response('', { status: 503 }) } })
    assert.equal(calls, 2)
    assert.equal(page.status, 503)
    assert.equal(page.meta.robots, 'noindex,follow')
    assert.doesNotMatch(page.html, /data-seo-fallback/)
  }
})

test('published detail retries a network reset but never retries a removed event', async () => {
  let calls = 0
  const restored = await renderPage({ path: '/discover/13', template: browseTemplate, siteUrl, apiBase: 'https://api.example',
    fetcher: async () => { if (++calls === 1) throw new TypeError('connection reset'); return publicJson(catalog) } })
  assert.equal(calls, 2)
  assert.equal(restored.status, 200)
  assert.match(restored.html, /41회 서울 프로젝트돌/)
  for (const status of [404, 410]) {
    calls = 0
    const removed = await renderPage({ path: '/discover/13', template: browseTemplate, siteUrl, apiBase: 'https://api.example',
      fetcher: async () => { calls++; return new Response('', { status }) } })
    assert.equal(calls, 1)
    assert.equal(removed.status, 404)
    assert.equal(removed.meta.robots, 'noindex,follow')
  }
})
