import test from 'node:test'
import assert from 'node:assert/strict'
import { publishedEvents, renderRobots, renderSitemap } from './sitemap.mjs'
test('company introduction is included once in the portal sitemap', () => {
  for (const splitSites of [false, true]) {
    const sitemap = renderSitemap('https://boothana.kr', [], splitSites)
    assert.equal((sitemap.match(/<loc>https:\/\/boothana\.kr\/about<\/loc>/g) || []).length, 1)
  }
  assert.ok(!renderSitemap('https://subculture.boothana.kr', [], true).includes('/about'))
})

test('sitemap contains canonical category and event URLs with valid escaping', () => {
  const output = renderSitemap('https://boothhana.example', [{ id: 13, publishedAt: '2026-09-27' }])
  assert.match(output, /https:\/\/boothhana\.example\/discover\?category=exhibitions/)
  assert.match(output, /category=exhibitions<\/loc>/)
  assert.match(output, /category=popups<\/loc>/)
  assert.match(output, /<loc>https:\/\/boothhana\.example\/discover\/13<\/loc><lastmod>2026-09-27<\/lastmod>/)
  assert.match(output, /<loc>https:\/\/boothhana\.example\/events<\/loc>/)
  assert.match(renderRobots('https://boothhana.example'), /Sitemap: https:\/\/boothhana\.example\/sitemap\.xml/)
})

test('the Sunday D.Festa event landing page is not a second indexed URL', () => {
  const output = renderSitemap('https://subculture.boothana.kr', [
    { id: 1, publishedAt: '2026-09-30' }, { id: 7, publishedAt: '2026-09-30' },
  ])
  assert.match(output, /\/discover\/1<\/loc>/)
  assert.doesNotMatch(output, /\/discover\/7<\/loc>/)
})

test('published event discovery combines all public categories and removes duplicates', async () => {
  const seen = []
  const fetcher = async url => {
    seen.push(url)
    const parsed = new URL(url)
    const category = parsed.searchParams.get('category')
    const id = category === 'SUBCULTURE' ? 1 : category === 'EXHIBITION' ? 2 : 3
    return new Response(JSON.stringify({ items: [{ id, event: { name: `event-${id}` }, publishedAt: '2026-09-27T00:00:00Z' }], page: 0, size: 100, total: 1 }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  }
  const rows = await publishedEvents({ apiBase: 'https://api.example', fetcher })
  assert.deepEqual(rows.map(row => row.id), [1, 2, 3])
  assert.equal(seen.length, 4)
})
