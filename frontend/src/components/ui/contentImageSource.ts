export type ContentImageKind = 'event' | 'booth' | 'product'

export const fallbackImages: Record<ContentImageKind, string> = {
  event: '/assets/fallback/event.svg',
  booth: '/assets/fallback/booth.svg',
  product: '/assets/fallback/product.svg',
}

export function contentImageUrl(url: string | null | undefined): string | null {
  const value = url?.trim()
  if (!value) return null
  if (value.startsWith('/') && !value.startsWith('//')) return value
  try {
    const parsed = new URL(value)
    return ['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password ? value : null
  } catch {
    return null
  }
}
