export interface PageMeta { title: string; description: string; canonical: string; robots: string; image: string; schema: Record<string, unknown> | null; verification: string }
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
export const SITE_TITLE: string
export const SITE_DESCRIPTION: string
export function siteOrigin(raw: string): string
export function normalizePath(raw: string): string
export function pageMetadata(input?: { path?: string; search?: string; siteUrl?: string; verification?: string; catalog?: PublicCatalogMeta | null; participant?: PublicParticipantMeta | null; unavailable?: boolean }): PageMeta
export function renderMetadata(meta: PageMeta): string
export function renderCrawlableContent(input?: { path?: string; catalog?: PublicCatalogMeta | null; participant?: PublicParticipantMeta | null }): string
export function injectMetadata(template: string, meta: PageMeta): string
export function injectCrawlableContent(template: string, content: string): string
