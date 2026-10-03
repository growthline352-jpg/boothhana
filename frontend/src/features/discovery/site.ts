import { categorySite, requestSiteOrigin, splitSitesEnabled } from '../../../seo/category-sites.mjs'

export function currentSiteOrigin() {
  return typeof window === 'undefined' ? '' : requestSiteOrigin(window.location.host, import.meta.env.VITE_PUBLIC_SITE_URL || '')
}
export function currentSiteCategory() { return categorySite(currentSiteOrigin()) }
export function isLocalPreview() {
  return typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(window.location.host)
}
export function categorySitesActive() {
  // Explicit rollout gate: enable public category sites after DNS/TLS/CORS checks pass.
  return splitSitesEnabled(currentSiteOrigin(), import.meta.env.VITE_CATEGORY_SITES_ENABLED === 'true')
}
