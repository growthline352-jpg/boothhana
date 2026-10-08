export interface PageMeta { title: string; description: string; canonical: string; robots: string; image: string; schema: Record<string, unknown> | null; verification: string; siteName?: string }
export interface PublicParticipantMeta {
  id: number
  participant: { registrationName: string; subjects?: string[] }
  sales?: { summary?: string; subjects?: string[]; categories?: string[]; products?: { name: string }[] } | null
  productRows?: { data: { name: string } }[]
}
export interface PublicCatalogMeta {
  id: number
  event: {
    name: string; description?: string; subcategory?: string; organizer?: string | null; region?: string
    venueName?: string | null; address?: string | null; admission?: string | null; subjects?: string[]
    operationStatus?: { state?: string }
    occurrences?: { startDate: string; endDate: string; startTime?: string | null; endTime?: string | null }[]
  }
  banner?: { url: string } | null
  assets?: { type: string; participantId: number | null; url: string }[]
  participants?: PublicParticipantMeta[]
}
export interface PublicListingMeta { id: number; name: string; description?: string; venue?: string; address?: string; startDate?: string; endDate?: string; urlPath: string }
export const SITE_TITLE: string
export const SITE_DESCRIPTION: string
export function siteOrigin(raw: string): string
export function normalizePath(raw: string): string
export function categoryFor(event: { subcategory?: string } | null | undefined): import('./category-sites.mjs').SiteCategory | null
export function catalogDirectoryPage(path: string, search?: string): number | null
export function catalogDirectoryHref(page?: number, category?: string): string
export function pageMetadata(input?: { path?: string; search?: string; siteUrl?: string; verification?: string; catalog?: PublicCatalogMeta | null; participant?: PublicParticipantMeta | null; listing?: PublicListingMeta[]; unavailable?: boolean; splitSites?: boolean }): PageMeta
export function renderMetadata(meta: PageMeta): string
export function renderCrawlableContent(input?: { path?: string; search?: string; catalog?: PublicCatalogMeta | null; participant?: PublicParticipantMeta | null; listing?: PublicListingMeta[]; pagination?: { page: number; size: number; total: number } | null; siteUrl?: string; splitSites?: boolean }): string
export function injectMetadata(template: string, meta: PageMeta): string
export function injectCrawlableContent(template: string, content: string): string
