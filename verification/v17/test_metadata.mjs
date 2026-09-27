import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdtemp, mkdir, writeFile, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pageMetadata, renderMetadata, injectMetadata, normalizePath, siteOrigin } from '../../frontend/seo/metadata.mjs'
import { createHandler, renderPage, apiOrigin, readBoundedJson } from '../../frontend/api/page.mjs'
const template = await readFile(new URL('../../frontend/index.html', import.meta.url), 'utf8')
const siteUrl = 'https://boothhana.example', apiBase = 'https://api.example'
const indexRobots = 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1'
const catalog = { id: 7, event: { name: '[TEST] 문구 행사', description: '공개 행사 소개' }, banner: { url: 'https://assets.example/approved.png' }, assets: [] }
const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })
test('home scope, Korean metadata and explicit canonical', () => {
 const m = pageMetadata({ siteUrl }); assert.match(m.title, /서울·경기/); assert.equal(m.robots, indexRobots); assert.equal(m.canonical, siteUrl + '/')
 const html = injectMetadata(template, m); assert.match(html, /lang="ko"/); assert.equal((html.match(/<title/g) || []).length, 1)
 assert.equal((html.match(/rel="canonical"/g) || []).length, 1); assert.match(html, /og:description/); assert.match(html, /application\/ld\+json/)
})
test('unconfigured/invalid public origins never invent canonical or indexability', () => {
 for (const raw of ['', 'http://example.com', 'https://u:p@example.com', 'https://example.com/path', 'https://example.com/?x=1']) {
  assert.equal(siteOrigin(raw), ''); const m = pageMetadata({ siteUrl: raw }); assert.equal(m.canonical, ''); assert.equal(m.robots, 'noindex,follow')
 }
})
test('unknown categories and filtered result pages are noindex', () => {
 for (const search of ['?category=unknown', '?q=PRIVATE_SEARCH', '?category=subculture&page=2']) {
  const m = pageMetadata({ path: '/discover', search, siteUrl }); assert.equal(m.robots, 'noindex,follow'); assert.ok(!renderMetadata(m).includes('PRIVATE_SEARCH'))
 }
})
test('account pages omit data and URL query values from metadata', () => {
 for (const path of ['/library', '/creator/booths', '/admin/events/9', '/support', '/reservations/2']) {
  const m = pageMetadata({ path, search: '?note=PRIVATE&token=secret', siteUrl, catalog }); assert.equal(m.robots, 'noindex,follow')
  assert.ok(!renderMetadata(m).includes('PRIVATE')); assert.ok(!renderMetadata(m).includes(catalog.event.name)); assert.ok(!renderMetadata(m).includes('secret'))
 }
})
test('event canonical drops visit/filter state and only uses approved banner', () => {
 const m = pageMetadata({ path: '/discover/7', search: '?day=2026-09-18&my=saved', siteUrl, catalog })
 assert.equal(m.canonical, siteUrl + '/discover/7'); assert.equal(m.image, catalog.banner.url); assert.equal(m.robots, indexRobots)
 const noBanner = pageMetadata({ path: '/discover/7', siteUrl, catalog: { ...catalog, banner: null, assets: [{ type: 'BANNER', participantId: null, url: 'https://assets.example/revoked.png' }] } })
 assert.ok(!renderMetadata(noBanner).includes('revoked.png'))
})
test('HTML attributes, titles, JSON-LD and replacement dollar tokens cannot inject markup', () => {
 const attack = { ...catalog, event: { name: '\"><script>alert(1)</script>$&', description: '</script><img src=x onerror=alert(1)> & \"' } }
 const m = pageMetadata({ path: '/discover/7', siteUrl, catalog: attack }); m.schema.name = '</script><script>alert(1)</script>'
 const html = injectMetadata(template, m); assert.ok(!html.includes('<script>alert(1)</script>')); assert.ok(!html.includes('<img src=x'))
 assert.equal((html.match(/<!-- BOOTH_META_START -->/g) || []).length, 1); assert.match(html, /\\u003c/)
})
test('unavailable/wrong event never retains old event metadata', () => {
 for (const input of [{ unavailable: true, catalog }, { catalog: { ...catalog, id: 8 } }, { catalog: null }]) {
  const m = pageMetadata({ path: '/discover/7', siteUrl, ...input }); assert.equal(m.robots, 'noindex,follow'); assert.ok(!m.title.includes('[TEST]'))
 }
})
test('path and API origin validation reject user-controlled absolute URLs', () => {
 for (const raw of ['//evil.test', 'https://evil.test', '/a?x=1', '/a\\b', '/a\nb']) assert.equal(normalizePath(raw), '/not-found')
 for (const raw of ['https://u:p@example.com', 'http://evil.test', 'file:///tmp/x', 'https://api.example/?url=evil']) assert.equal(apiOrigin(raw), '')
 assert.equal(apiOrigin('http://localhost:8080'), 'http://localhost:8080')
})
test('server emits event metadata in raw HTML without JavaScript and without cookies', async () => {
 let options, requested
 const page = await renderPage({ path: '/discover/7', template, siteUrl, apiBase, fetcher: async (url, init) => { requested = url; options = init; return json(catalog) } })
 assert.equal(page.status, 200); assert.match(page.html, /\[TEST\] 문구 행사/); assert.equal(requested, apiBase + '/api/public/catalog/events/7')
 assert.equal(options.redirect, 'error'); assert.equal(options.credentials, 'omit'); assert.deepEqual(options.headers, { Accept: 'application/json' })
})
test('server returns 404 on withdrawn event, 503 on outage, and always noindex', async () => {
 for (const [status, expected] of [[404, 404], [410, 404], [401, 503], [429, 503], [500, 503]]) {
  const page = await renderPage({ path: '/discover/7', template, siteUrl, apiBase, fetcher: async () => new Response('', { status }) })
  assert.equal(page.status, expected); assert.equal(page.meta.robots, 'noindex,follow'); assert.ok(!page.html.includes('approved.png'))
 }
})
test('server handles invalid response and missing origin without a false indexed success', async () => {
 for (const item of [null, {}, { ...catalog, id: 8 }]) {
  const page = await renderPage({ path: '/discover/7', template, siteUrl, apiBase, fetcher: async () => json(item) })
  assert.equal(page.status, 503); assert.equal(page.meta.robots, 'noindex,follow')
 }
 let calls = 0; await renderPage({ path: '/discover/7', template, siteUrl, apiBase: '', fetcher: async () => { calls++; return json(catalog) } }); assert.equal(calls, 0)
})
test('bounded response and missing template marker fail explicitly', async () => {
 await assert.rejects(readBoundedJson(new Response('x', { headers: { 'Content-Type': 'text/html' } })))
 await assert.rejects(readBoundedJson(new Response('{}', { headers: { 'Content-Type': 'application/json', 'Content-Length': '5000000' } })))
 assert.throws(() => injectMetadata('<html></html>', pageMetadata()))
})

test('hosting build removes public index bypass but retains private HTML and public assets', async () => {
 const { prepareHosting } = await import('../../frontend/scripts/prepare-hosting.mjs')
 const base = await mkdtemp(join(tmpdir(), 'v17-hosting-'))
 try {
  await mkdir(join(base, 'dist', 'assets'), { recursive: true })
  const built = template.replace('/src/main.tsx', '/assets/app-fixture.js')
  await writeFile(join(base, 'dist', 'index.html'), built); await writeFile(join(base, 'dist', 'assets', 'app-fixture.js'), '// fixture')
  await prepareHosting(base)
  await assert.rejects(access(join(base, 'dist', 'index.html')))
  assert.equal(await readFile(join(base, 'seo-template', 'index.html'), 'utf8'), built)
  await access(join(base, 'dist', 'assets', 'app-fixture.js'))
 } finally { await rm(base, { recursive: true, force: true }) }
})
test('hosting preparation refuses unbuilt or mismatched template', async () => {
 const { prepareHosting } = await import('../../frontend/scripts/prepare-hosting.mjs')
 const base = await mkdtemp(join(tmpdir(), 'v17-unbuilt-'))
 try {
  await mkdir(join(base, 'dist')); await writeFile(join(base, 'dist', 'index.html'), template)
  await assert.rejects(prepareHosting(base)); await access(join(base, 'dist', 'index.html'))
 } finally { await rm(base, { recursive: true, force: true }) }
})
test('Node request adapter applies no-store, noindex, method and HEAD behavior', async () => {
 const oldSite = process.env.PUBLIC_SITE_URL
 const response = () => ({ headers: {}, setHeader(k,v) { this.headers[k] = v }, end(value) { this.body = value }, statusCode: 0 })
 const handler = createHandler(async () => template)
 try {
  process.env.PUBLIC_SITE_URL = siteUrl
  for (const method of ['GET','HEAD']) {
   const res = response(); await handler({ method, url: '/api/page?path=/library&note=SECRET', query: { path: '/library' }, headers: { cookie:'SESSION=SECRET' } }, res)
   assert.equal(res.statusCode, 200); assert.equal(res.headers['Cache-Control'], 'private, no-store'); assert.equal(res.headers['X-Robots-Tag'], 'noindex,follow')
   if (method === 'GET') { assert.ok(!res.body.includes('SECRET')); assert.match(res.body, /내 보관함/) } else assert.equal(res.body, undefined)
  }
  const post = response(); await handler({method:'POST'},post); assert.equal(post.statusCode,405); assert.equal(post.headers.Allow,'GET, HEAD')
  const missing = response(); await createHandler(async () => { throw new Error('missing fixture') })({method:'HEAD',url:'/',query:{}},missing); assert.equal(missing.statusCode,503); assert.equal(missing.body,undefined)
 } finally { if (oldSite === undefined) delete process.env.PUBLIC_SITE_URL; else process.env.PUBLIC_SITE_URL=oldSite }
})
