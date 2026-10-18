import { parseEventPage, legacyEventRedirect } from '../seo/event-pages.mjs'
import { readFile } from 'node:fs/promises'
import { catalogDirectoryPage, categoryFor, injectCrawlableContent, injectMetadata, normalizePath, pageMetadata, renderCrawlableContent, siteOrigin } from '../seo/metadata.mjs'
import { CATEGORY_SITES, PORTAL_ORIGIN, categorySite, categoryRedirect, requestSiteOrigin } from '../seo/category-sites.mjs'
import { naverVerificationFor } from '../seo/naver-verification.mjs'

const MAX_RESPONSE = 4 * 1024 * 1024
// Two independent attempts plus backoff fit within the 30-second function limit.
const PUBLIC_FETCH_TIMEOUT = 12000
const RETRY_DELAY = 250
// Share only unfinished reads in this instance, never cache a completed publication.
const pendingSources = new WeakMap()
const DIRECTORY_PAGE_SIZE = 20
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
class PublicSourceError extends Error {
  constructor(reason, status = 0) { super(reason); this.reason = reason; this.status = status }
}
async function readPublicSource(origin, path, fetcher) {
  const started = performance.now()
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), PUBLIC_FETCH_TIMEOUT)
    let failure
    try {
      const response = await fetcher(`${origin}${path}`, {
        signal: controller.signal, redirect: 'error', credentials: 'omit',
        headers: { Accept: 'application/json' },
      })
      if (!response.ok) {
        if (response.body) await response.body.cancel().catch(() => {})
        throw new PublicSourceError('http', response.status)
      }
      const data = await readBoundedJson(response)
      const elapsedMs = Math.round(performance.now() - started)
      if (attempt || elapsedMs >= 6500) console.info(JSON.stringify({
        event: attempt ? 'seo_source_recovered' : 'seo_source_slow', source: path, attempts: attempt + 1, elapsedMs,
      }))
      return data
    } catch (error) {
      failure = error instanceof PublicSourceError ? error : new PublicSourceError(
        controller.signal.aborted ? 'timeout' : error instanceof TypeError ? 'network' : 'invalid_response')
    } finally {
      clearTimeout(timer)
      controller.abort()
    }
    const retryable = ['timeout', 'network'].includes(failure.reason) || [500, 502, 503, 504].includes(failure.status)
    if (attempt || !retryable) {
      if (![404, 410].includes(failure.status)) console.warn(JSON.stringify({
        event: 'seo_source_failed', source: path, reason: failure.reason,
        upstreamStatus: failure.status, attempts: attempt + 1, elapsedMs: Math.round(performance.now() - started),
      }))
      throw failure
    }
    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY))
  }
}
function fetchJson(origin, path, fetcher) {
  let pending = pendingSources.get(fetcher)
  if (!pending) { pending = new Map(); pendingSources.set(fetcher, pending) }
  const key = `${origin}${path}`
  if (!pending.has(key)) pending.set(key, readPublicSource(origin, path, fetcher).finally(() => pending.delete(key)))
  return pending.get(key)
}
async function fetchBrowseListing(origin, path, search, fetcher, siteUrl) {
  const params = new URLSearchParams(search)
  const directoryPage = catalogDirectoryPage(path, search)
  if (directoryPage === null && [...params.keys()].some(key => key !== 'category')) return { listing: [], pagination: null }
  if (path === '/events') {
    const rows = await fetchJson(origin, '/api/public/events', fetcher)
    if (!Array.isArray(rows)) throw new Error('Invalid public event listing')
    return { listing: platformListing(rows), pagination: null }
  }
  const hostCategory = categorySite(siteUrl)
  const requested = hostCategory || params.get('category') || 'subculture'
  if (!Object.hasOwn(CATALOG_CATEGORY, requested)) return { listing: [], pagination: null }
  const categories = path === '/' && !hostCategory ? Object.values(CATALOG_CATEGORY) : [CATALOG_CATEGORY[requested]]
  const page = directoryPage ?? 0
  const size = directoryPage !== null ? DIRECTORY_PAGE_SIZE : path === '/' ? 12 : 24
  const results = await Promise.all(categories.map(category => fetchJson(origin, `/api/public/catalog/events?category=${category}&page=${page}&size=${size}&sort=RECENT&grouped=true`, fetcher)))
  const unique = new Map()
  for (const result of results) {
    if (!Array.isArray(result?.items) || !Number.isSafeInteger(result.total) || result.total < 0) throw new Error('Invalid catalog listing')
    if (directoryPage !== null && page > 0 && page * size >= result.total) return { listing: [], pagination: null, notFound: true }
    if (page * size < result.total && !result.items.length) throw new Error('Incomplete catalog listing')
    for (const row of catalogListing(result.items)) unique.set(row.urlPath, row)
  }
  return { listing: [...unique.values()].slice(0, 36), pagination: directoryPage !== null ? { page, size, total: results[0].total } : null }
}
export async function renderPage({ path, search = '', template, siteUrl, verification = '', naverVerification = '', apiBase, fetcher = fetch, splitSites = false }) {
  path = normalizePath(path)
  let catalog = null, participant = null, listing = [], pagination = null, unavailable = false, status = 200
  const origin = apiOrigin(apiBase)
  const redirect = categoryRedirect({ origin: siteUrl, path, search, enabled: splitSites })
  if (redirect) return { status: 308, location: redirect }
  const legacy = legacyEventRedirect(path, search)
  if (legacy) {
    // Consolidate old tab syntax and a wrong category host in the same redirect.
    if (origin) try {
      const target = new URL(legacy,'https://placeholder.invalid')
      const page = parseEventPage(target.pathname)
      const header = await fetchJson(origin,`/api/public/catalog/events/${page.eventId}/overview`,fetcher)
      if(Number(header?.id)===Number(page.eventId)) {
        const crossHost=categoryRedirect({origin:siteUrl,path:target.pathname,search:target.search,category:categoryFor(header.event),enabled:splitSites})
        if(crossHost)return {status:308,location:crossHost}
      }
    } catch {}
    return { status:308, location:`${siteOrigin(siteUrl)}${legacy}` }
  }
  const match = parseEventPage(path)
  if (match) {
    if (!origin) { unavailable=true;status=503 }
    else try {
      const params = new URLSearchParams(search), query = new URLSearchParams()
      const section = match.section
      if (['booths','reviews'].includes(section)) {
        const page = params.get('page') || '0'
        if (!/^\d+$/.test(page) || Number(page)>10000) {const error=new Error('Invalid page');error.status=404;throw error}
        query.set('page',String(Number(page)))
      }
      if (section === 'booths') {
        query.set('size','24')
        for (const key of ['q','day','hall','subject','category']) if(params.get(key))query.set(key,params.get(key))
      }
      const personal = section==='booths' && ['saved','visited'].includes(params.get('my'))
      const endpoint = section === 'home' || personal ? 'overview' : section === 'booth' ? `booths/${match.participantId}` : section
      catalog = await fetchJson(origin, `/api/public/catalog/events/${match.eventId}/${endpoint}${query.size?`?${query}`:''}`, fetcher)
      if (Number(catalog?.id)!==Number(match.eventId) || typeof catalog?.event?.name!=='string' || !catalog.event.name.trim())throw new Error('Invalid public event')
      if (Number(catalog.id)===1 && catalog.event.name==='제35회 디. 페스타 (토요일)') catalog={...catalog,event:{...catalog.event,name:'제35회 디. 페스타',occurrences:[...catalog.event.occurrences,{startDate:'2026-10-04',endDate:'2026-10-04',startTime:'11:00',endTime:'16:00'}]}}
      if (section === 'booth') {
        participant=catalog.participants?.find(row=>Number(row?.id)===Number(match.participantId))||null
        if(!participant){unavailable=true;status=404}
      }
      const listing = section === 'booths' ? catalog.pagination : section === 'reviews' ? {...catalog.reviewsPage,size:20,page:Number(params.get('page')||0)} : null
      if(listing && listing.page>0 && listing.page*listing.size>=listing.total){unavailable=true;status=404}
    } catch(error) {catalog=null;unavailable=true;status=[400,404,410].includes(error.status)?404:503}
  } else if (/^\/discover\/[0-9]+\//.test(path)) {unavailable=true;status=404}
  if (catalog && !unavailable) {
    const destination = categoryRedirect({ origin: siteUrl, path, search, category: categoryFor(catalog.event), enabled: splitSites })
    if (destination) return { status: 308, location: destination }
  }
  if (!match && origin && ['/', '/discover', '/events'].includes(path) && !(path === '/' && siteUrl === PORTAL_ORIGIN && splitSites)) {
    try {
      const result = await fetchBrowseListing(origin, path, search, fetcher, siteUrl)
      listing = result.listing; pagination = result.pagination
      if (result.notFound) { unavailable = true; status = 404 }
    } catch { unavailable = true; status = 503 }
  }
  if (path === '/not-found') status = 404
  const meta = pageMetadata({ path, search, siteUrl, verification, naverVerification, catalog, participant, listing, unavailable, splitSites })
  const withMetadata = injectMetadata(template, meta)
  const content = unavailable ? '' : renderCrawlableContent({ path, search, catalog, participant, listing, pagination, siteUrl, splitSites })
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
      if (path.startsWith('/itinerary/shared/')) { res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Robots-Tag', 'noindex, nofollow') }
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
