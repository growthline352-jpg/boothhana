import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { pageMetadata, renderMetadata, type PublicCatalogMeta } from '../../seo/metadata.mjs'

export function PageMetadata({ catalog = null, unavailable = false }: { catalog?: PublicCatalogMeta | null; unavailable?: boolean }) {
  const location = useLocation()
  useEffect(() => {
    const meta = pageMetadata({ path: location.pathname, search: location.search,
      siteUrl: import.meta.env.VITE_PUBLIC_SITE_URL ?? '', catalog, unavailable })
    document.documentElement.lang = 'ko'
    document.head.querySelectorAll('[data-booth-meta]').forEach(node => node.remove())
    document.head.insertAdjacentHTML('beforeend', renderMetadata(meta))
  }, [location.pathname, location.search, catalog, unavailable])
  return null
}

/** The detail loader owns its metadata so a parent effect cannot overwrite it. */
export function RouteMetadata() {
  const location = useLocation()
  return /^\/discover\/[1-9]\d*\/?$/.test(location.pathname) ? null : <PageMetadata />
}
