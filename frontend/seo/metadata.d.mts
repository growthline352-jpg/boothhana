export interface PageMeta { title: string; description: string; canonical: string; robots: string; image: string; schema: Record<string, unknown> | null }
export interface PublicCatalogMeta { id: number; event: { name: string; description?: string }; banner?: { url: string } | null; assets?: { type: string; participantId: number | null; url: string }[] }
export const SITE_TITLE: string
export const SITE_DESCRIPTION: string
export function siteOrigin(raw: string): string
export function normalizePath(raw: string): string
export function pageMetadata(input?: { path?: string; search?: string; siteUrl?: string; catalog?: PublicCatalogMeta | null; unavailable?: boolean }): PageMeta
export function renderMetadata(meta: PageMeta): string
export function injectMetadata(template: string, meta: PageMeta): string
