import { parseEventPage } from '../../seo/event-pages.mjs'
import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { categoryFor, clientPageMetadata, renderMetadata, type PublicCatalogMeta, type PublicParticipantMeta } from '../../seo/metadata.mjs'
import { categoryRedirect } from '../../seo/category-sites.mjs'
import { categorySitesActive, currentSiteOrigin, isLocalPreview } from '../features/discovery/site'

const runtimeEnv = import.meta.env as { VITE_PUBLIC_SITE_URL?: string; VITE_GOOGLE_SITE_VERIFICATION?: string }

export function PageMetadata({ catalog = null, participant = null, unavailable = false, pending = false }: { catalog?: PublicCatalogMeta | null; participant?: PublicParticipantMeta | null; unavailable?: boolean; pending?: boolean }) {
  const location = useLocation()
  useEffect(() => {
    const siteUrl = currentSiteOrigin()
    const splitSites = categorySitesActive()
    const destination = categoryRedirect({ origin: siteUrl, path: location.pathname, search: location.search, category: unavailable ? null : categoryFor(catalog?.event), enabled: splitSites })
    if (destination && !isLocalPreview()) { window.location.replace(destination + window.location.hash); return }
    const meta = clientPageMetadata({ path: location.pathname, search: location.search, pending,
      currentCanonical: document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? '',
      siteUrl, splitSites, verification: runtimeEnv.VITE_GOOGLE_SITE_VERIFICATION ?? '', catalog, participant, unavailable })
    if (!meta) return
    document.documentElement.lang = 'ko'
    document.head.querySelectorAll('[data-booth-meta]').forEach(node => node.remove())
    document.head.insertAdjacentHTML('beforeend', renderMetadata(meta))
  }, [location.pathname, location.search, catalog, participant, unavailable, pending])
  return null
}

/** The detail loader owns its metadata so a parent effect cannot overwrite it. */
export function RouteMetadata() {
  const location = useLocation()
  return parseEventPage(location.pathname) ? null : <PageMetadata />
}
