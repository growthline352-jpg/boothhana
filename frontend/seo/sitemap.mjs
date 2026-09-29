import { apiOrigin, readBoundedJson } from '../api/page.mjs'
import { siteOrigin } from './metadata.mjs'
import { CATEGORY_SITES, PORTAL_ORIGIN, categorySite } from './category-sites.mjs'

const CATEGORIES = ['SUBCULTURE', 'EXHIBITION', 'FESTIVAL']
const MAX_URLS = 50_000
const xml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c])
const validPublishedAt = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) ? value.slice(0, 10) : ''

async function fetchPage(origin, category, page, signal, fetcher) {
  const url = `${origin}/api/public/catalog/events?category=${category}&page=${page}&size=100&sort=RECENT`
  const response = await fetcher(url, { signal, redirect: 'error', credentials: 'omit', headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`Catalog sitemap source returned ${response.status}`)
  const value = await readBoundedJson(response)
  if (!Array.isArray(value?.items) || !Number.isSafeInteger(Number(value?.total)) || Number(value.total) < 0) throw new Error('Invalid catalog sitemap source')
  return value
}

async function fetchCategory(origin, category, signal, fetcher) {
  const first = await fetchPage(origin, category, 0, signal, fetcher)
  const pages = Math.ceil(Number(first.total) / 100)
  if (pages > 500 || Number(first.total) > MAX_URLS) throw new Error('Catalog sitemap source exceeds supported size')
  const rest = await Promise.all(Array.from({ length: Math.max(0, pages - 1) }, (_, index) => fetchPage(origin, category, index + 1, signal, fetcher)))
  return [first, ...rest].flatMap(value => value.items)
}

export async function publishedEvents({ apiBase, fetcher = fetch, timeoutMs = 20_000, category = null }) {
  const origin = apiOrigin(apiBase)
  if (!origin) throw new Error('SEO API origin is not configured')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    if (category && !Object.hasOwn(CATEGORY_SITES, category)) throw new Error('Unknown sitemap category')
    const selected = category ? [CATEGORY_SITES[category].code] : CATEGORIES
    const rows = (await Promise.all(selected.map(category => fetchCategory(origin, category, controller.signal, fetcher)))).flat()
    const unique = new Map()
    for (const row of rows) {
      const id = Number(row?.id)
      if (!Number.isSafeInteger(id) || id < 1 || typeof row?.event?.name !== 'string' || !row.event.name.trim()) continue
      unique.set(id, { id, publishedAt: validPublishedAt(row.publishedAt) })
    }
    return [...unique.values()].sort((left, right) => left.id - right.id)
  } finally { clearTimeout(timer) }
}

export function renderSitemap(siteUrl, events, splitSites = false) {
  const origin = siteOrigin(siteUrl)
  if (!origin) throw new Error('Public site origin is not configured')
  if (!Array.isArray(events) || events.length + 5 > MAX_URLS) throw new Error('Sitemap URL limit exceeded')
  const newest = events.map(event => event.publishedAt).filter(Boolean).sort().at(-1) || ''
  const siteCategory = categorySite(origin)
  const urls = siteCategory ? [
    { loc: `${origin}/`, lastmod: newest },
    ...events.map(event => ({ loc: `${origin}/discover/${event.id}`, lastmod: event.publishedAt })),
  ] : splitSites && origin === PORTAL_ORIGIN ? [
    { loc: `${origin}/`, lastmod: newest }, { loc: `${origin}/events`, lastmod: newest },
  ] : [
    { loc: `${origin}/`, lastmod: newest },
    { loc: `${origin}/discover`, lastmod: newest },
    { loc: `${origin}/discover?category=exhibitions`, lastmod: newest },
    { loc: `${origin}/discover?category=festivals`, lastmod: newest },
    { loc: `${origin}/events`, lastmod: newest },
    ...events.map(event => ({ loc: `${origin}/discover/${event.id}`, lastmod: event.publishedAt })),
  ]
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(entry => `  <url><loc>${xml(entry.loc)}</loc>${entry.lastmod ? `<lastmod>${xml(entry.lastmod)}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`
}

export function renderRobots(siteUrl) {
  const origin = siteOrigin(siteUrl)
  if (!origin) throw new Error('Public site origin is not configured')
  return `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`
}
