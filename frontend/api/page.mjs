import { readFile } from 'node:fs/promises'
import { categoryFor, injectCrawlableContent, injectMetadata, normalizePath, pageMetadata, renderCrawlableContent, siteOrigin } from '../seo/metadata.mjs'
import { CATEGORY_SITES, PORTAL_ORIGIN, categorySite, categoryRedirect, requestSiteOrigin } from '../seo/category-sites.mjs'
import { naverVerificationFor } from '../seo/naver-verification.mjs'

const MAX_RESPONSE = 4 * 1024 * 1024
/** Configured API origin only; never request Host, user URLs, cookies or redirects. */
export function apiOrigin(raw) {
  try {
    const u = new URL(raw)
    if (u.username || u.password || u.search || u.hash || u.pathname !== '/') return ''
    if (u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname))) return u.origin
  } catch { /* invalid config */ }
  return ''
}
export async function readBoundedJson(response) {
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Unexpected API content type')
  if (Number(response.headers.get('content-length')) > MAX_RESPONSE) throw new Error('API response too large')
  const reader = response.body.getReader(); const chunks = []; let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break
      size += value.length
      if (size > MAX_RESPONSE) { await reader.cancel(); throw new Error('API response too large') }
      chunks.push(Buffer.from(value))
    }
  } finally { reader.releaseLock() }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

const CATALOG_CATEGORY = Object.fromEntries(Object.entries(CATEGORY_SITES).map(([key, site]) => [key, site.code]))
const clean = value => typeof value === 'string' ? value.trim() : ''
function catalogListing(rows) {
  if (!Array.isArray(rows)) return []
  return rows.flatMap(row => {
    const sourceId = Number(row?.id), event = row?.event
    const dfesta = (sourceId === 1 && clean(event?.name) === '제35회 디. 페스타 (토요일)')
      || (sourceId === 7 && clean(event?.name) === '제35회 디. 페스타 (일요일)')
    const id = dfesta ? 1 : sourceId
    if (!Number.isSafeInteger(id) || id < 1 || !clean(event?.name)) return []
    const occurrence = Array.isArray(event.occurrences) ? event.occurrences[0] : null
    return [{
      id, name: dfesta ? '제35회 디. 페스타' : clean(event.name), description: clean(event.description), venue: clean(event.venueName), address: clean(event.address),
      startDate: dfesta ? '2026-10-03' : clean(occurrence?.startDate), endDate: dfesta ? '2026-10-04' : clean(occurrence?.endDate), urlPath: `/discover/${id}`, category: categoryFor(event),
    }]
  })
}
function platformListing(rows) {
  if (!Array.isArray(rows)) return []
  return rows.flatMap(row => {
    const id = Number(row?.id)
    if (!Number.isSafeInteger(id) || id < 1 || !clean(row?.name)) return []
    return [{
      id, name: clean(row.name), description: clean(row.description), venue: clean(row.venue), address: '',
      startDate: clean(row.startAt).slice(0, 10), endDate: clean(row.endAt).slice(0, 10), urlPath: `/events/${id}`,
    }]
  })
}
async function fetchJson(origin, path, signal, fetcher) {
  const response = await fetcher(`${origin}${path}`, {
    signal, redirect: 'error', credentials: 'omit', headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`Public SEO source returned ${response.status}`)
  return readBoundedJson(response)
}
async function fetchBrowseListing(origin, path, search, fetcher, siteUrl) {
  const params = new URLSearchParams(search)
  if ([...params.keys()].some(key => key !== 'category')) return []
  // Do not hold the initial document behind a sleeping Render instance; crawlers can retry after it wakes.
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 1500)
  try {
    if (path === '/events') return platformListing(await fetchJson(origin, '/api/public/events', controller.signal, fetcher))
    const hostCategory = categorySite(siteUrl)
    const requested = hostCategory || params.get('category') || 'subculture'
    if (!(requested in CATALOG_CATEGORY)) return []
    const categories = path === '/' && !hostCategory ? Object.values(CATALOG_CATEGORY) : [CATALOG_CATEGORY[requested]]
    const settled = await Promise.allSettled(categories.map(category => fetchJson(origin, `/api/public/catalog/events?category=${category}&page=0&size=${path === '/' ? 12 : 24}&sort=RECENT`, controller.signal, fetcher)))
    const unique = new Map()
    for (const result of settled) if (result.status === 'fulfilled') {
      for (const row of catalogListing(result.value?.items)) unique.set(row.urlPath, row)
    }
    return [...unique.values()].slice(0, 36)
  } finally { clearTimeout(timer) }
}
export async function renderPage({ path, search = '', template, siteUrl, verification = '', naverVerification = '', apiBase, fetcher = fetch, splitSites = false }) {
  path = normalizePath(path)
  let catalog = null, participant = null, listing = [], unavailable = false, status = 200
  const origin = apiOrigin(apiBase)
  const redirect = categoryRedirect({ origin: siteUrl, path, search, enabled: splitSites })
  if (redirect) return { status: 308, location: redirect }
  if (path === '/discover/7') {
    const query = new URLSearchParams(search)
    const legacyBooth = query.get('booth')
    if (legacyBooth && /^[1-9]\d*$/.test(legacyBooth)) {
      query.delete('booth')
      return { status: 308, location: `${siteOrigin(siteUrl)}/discover/7/booths/${legacyBooth}${query.size ? `?${query}` : ''}` }
    }
    if (!query.has('day')) query.set('day', '2026-10-04')
    return { status: 308, location: `${siteOrigin(siteUrl)}/discover/1?${query}` }
  }
  const match = /^\/discover\/([1-9]\d*)(?:\/booths\/([1-9]\d*))?$/.exec(path)
  if (match) {
    if (!origin || !Number.isSafeInteger(Number(match[1]))) { unavailable = true; status = 503 }
    else {
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 4000)
      try {
        const response = await fetcher(`${origin}/api/public/catalog/events/${match[1]}`, {
          signal: controller.signal, redirect: 'error', credentials: 'omit', headers: { Accept: 'application/json' },
        })
        if (!response.ok) { unavailable = true; status = response.status === 404 || response.status === 410 ? 404 : 503 }
        else {
          catalog = await readBoundedJson(response)
          if (Number(catalog?.id) !== Number(match[1]) || typeof catalog?.event?.name !== 'string' || !catalog.event.name.trim()) throw new Error('Invalid public event')
          if (Number(catalog.id) === 1 && catalog.event.name === '제35회 디. 페스타 (토요일)') {
            catalog = { ...catalog, event: { ...catalog.event, name: '제35회 디. 페스타', occurrences: [
              ...catalog.event.occurrences,
              { startDate: '2026-10-04', endDate: '2026-10-04', startTime: '11:00', endTime: '16:00' },
            ] } }
          }
          if (match[2]) {
            participant = catalog.participants?.find(row => Number(row?.id) === Number(match[2])) || null
            if (!participant) { unavailable = true; status = 404 }
          }
        }
      } catch { catalog = null; unavailable = true; status = 503 }
      finally { clearTimeout(timer) }
    }
  }
  if (catalog && !unavailable) {
    const destination = categoryRedirect({ origin: siteUrl, path, search, category: categoryFor(catalog.event), enabled: splitSites })
    if (destination) return { status: 308, location: destination }
  }
  if (!match && origin && ['/', '/discover', '/events'].includes(path) && !(path === '/' && siteUrl === PORTAL_ORIGIN && splitSites)) {
    // Listing markup improves crawlability, but a sleeping API must not turn a public listing page into a 503.
    try { listing = await fetchBrowseListing(origin, path, search, fetcher, siteUrl) } catch { listing = [] }
  }
  if (path === '/not-found') status = 404
  const meta = pageMetadata({ path, search, siteUrl, verification, naverVerification, catalog, participant, listing, unavailable, splitSites })
  const withMetadata = injectMetadata(template, meta)
  const content = unavailable ? '' : renderCrawlableContent({ path, search, catalog, participant, listing, siteUrl, splitSites })
  return { status, meta, html: injectCrawlableContent(withMetadata, content) }
}
export function createHandler(loadTemplate = () => readFile(new URL('../seo-template/index.html', import.meta.url), 'utf8')) {
  return async function handler(req, res) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    // Do not retain event titles/images after an unpublish or rights revocation.
    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); res.statusCode = 405; res.end(); return }
    try {
      const raw = Array.isArray(req.query?.path) ? '' : req.query?.path
      const request = new URL(req.url || '/', 'https://request.invalid')
      const path = normalizePath(typeof raw === 'string' ? '/' + raw.replace(/^\//, '') : request.pathname)
      const search = new URLSearchParams(request.search)
      search.delete('path') // framework routing parameter is not a user-visible search filter
      const siteUrl = requestSiteOrigin(req.headers?.host, siteOrigin(process.env.PUBLIC_SITE_URL || ''))
      const template = await loadTemplate()
      const page = await renderPage({ path, search: search.toString(), template, siteUrl, verification: process.env.GOOGLE_SITE_VERIFICATION || '', naverVerification: naverVerificationFor(siteUrl), apiBase: process.env.SEO_API_BASE_URL || process.env.VITE_API_BASE_URL || '', splitSites: process.env.CATEGORY_SITES_ENABLED === 'true' })
      res.statusCode = page.status
      if (page.location) { res.setHeader('Location', page.location); res.end(); return }
      res.setHeader('X-Robots-Tag', page.meta.robots)
      if (page.status === 503) res.setHeader('Retry-After', '60')
      res.end(req.method === 'HEAD' ? undefined : page.html)
    } catch (error) {
      // Missing build/config never becomes a false successful SEO response.
      console.error('SEO page render failed', error)
      res.statusCode = 503; res.setHeader('X-Robots-Tag', 'noindex'); res.end(req.method === 'HEAD' ? undefined : '서비스 준비 상태를 확인하고 있습니다.')
    }
  }
}

export default createHandler()
