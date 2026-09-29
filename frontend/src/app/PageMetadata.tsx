import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { categoryFor, pageMetadata, renderMetadata, type PublicCatalogMeta, type PublicParticipantMeta } from '../../seo/metadata.mjs'
import { categoryRedirect } from '../../seo/category-sites.mjs'
import { categorySitesActive, currentSiteOrigin } from '../features/discovery/site'

const runtimeEnv = import.meta.env as { VITE_PUBLIC_SITE_URL?: string; VITE_GOOGLE_SITE_VERIFICATION?: string }

export function PageMetadata({ catalog = null, participant = null, unavailable = false }: { catalog?: PublicCatalogMeta | null; participant?: PublicParticipantMeta | null; unavailable?: boolean }) {
  const location = useLocation()
  useEffect(() => {
    const siteUrl = currentSiteOrigin()
    const splitSites = categorySitesActive()
    const destination = categoryRedirect({ origin: siteUrl, path: location.pathname, search: location.search, category: unavailable ? null : categoryFor(catalog?.event), enabled: splitSites })
    if (destination) { window.location.replace(destination + window.location.hash); return }
    const meta = pageMetadata({ path: location.pathname, search: location.search,
      siteUrl, splitSites, verification: runtimeEnv.VITE_GOOGLE_SITE_VERIFICATION ?? '', catalog, participant, unavailable })
    document.documentElement.lang = 'ko'
    document.head.querySelectorAll('[data-booth-meta]').forEach(node => node.remove())
    document.head.insertAdjacentHTML('beforeend', renderMetadata(meta))
  }, [location.pathname, location.search, catalog, participant, unavailable])
  return null
}

/** The detail loader owns its metadata so a parent effect cannot overwrite it. */
export function RouteMetadata() {
  const location = useLocation()
  return /^\/discover\/[1-9]\d*(?:\/booths\/[1-9]\d*)?\/?$/.test(location.pathname) ? null : <PageMetadata />
}
