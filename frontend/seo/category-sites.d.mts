export type SiteCategory = 'subculture' | 'exhibitions' | 'festivals' | 'popups'
export const PORTAL_ORIGIN: string
export const CATEGORY_SITES: Record<SiteCategory, { origin: string; label: string; code: string; name: string; description: string }>
export function categorySite(origin: string): SiteCategory | null
export function requestSiteOrigin(host: unknown, fallback?: string): string
export function splitSitesEnabled(origin: string, enabled?: boolean): boolean
export function categoryOrigin(category: string | null): string
export function categoryHome(category: SiteCategory, origin: string, enabled?: boolean): string
export function categoryRedirect(input: { origin: string; path: string; search?: string; category?: string | null; enabled?: boolean }): string
