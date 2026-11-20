import { renderRobots } from '../seo/sitemap.mjs'
import { siteOrigin } from '../seo/metadata.mjs'
import { requestSiteOrigin } from '../seo/category-sites.mjs'

export default function handler(req, res) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); res.statusCode = 405; res.end(); return }
  try {
    const body = renderRobots(requestSiteOrigin(req.headers?.host, siteOrigin(process.env.PUBLIC_SITE_URL || '')))
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400')
    res.statusCode = 200
    res.end(req.method === 'HEAD' ? undefined : body)
  } catch (error) {
    console.error('robots.txt generation failed', error)
    res.setHeader('Cache-Control', 'no-store')
    res.statusCode = 503
    res.end(req.method === 'HEAD' ? undefined : 'User-agent: *\nDisallow: /\n')
  }
}
