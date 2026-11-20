import { publishedEvents, renderSitemap } from '../seo/sitemap.mjs'
import { siteOrigin } from '../seo/metadata.mjs'
import { PORTAL_ORIGIN, categorySite, requestSiteOrigin } from '../seo/category-sites.mjs'

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); res.statusCode = 405; res.end(); return }
  try {
    const siteUrl = requestSiteOrigin(req.headers?.host, siteOrigin(process.env.PUBLIC_SITE_URL || ''))
    const splitSites = process.env.CATEGORY_SITES_ENABLED === 'true'
    const events = siteUrl === PORTAL_ORIGIN && splitSites ? [] : await publishedEvents({ apiBase: process.env.SEO_API_BASE_URL || process.env.VITE_API_BASE_URL || '', category: categorySite(siteUrl) })
    const body = renderSitemap(siteUrl, events, splitSites)
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600')
    res.statusCode = 200
    res.end(req.method === 'HEAD' ? undefined : body)
  } catch (error) {
    console.error('Sitemap generation failed', error)
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Retry-After', '60')
    res.statusCode = 503
    res.end(req.method === 'HEAD' ? undefined : 'Sitemap is temporarily unavailable.')
  }
}
