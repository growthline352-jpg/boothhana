import { useState } from 'react'
import { contentImageUrl, fallbackImages, type ContentImageKind } from './contentImageSource'
import { categoryForType } from '../../features/discovery/categories'

const fallbackLabels: Record<ContentImageKind, string> = {
  event: '행사', booth: '부스', product: '상품',
}

export function ContentImage({ url, kind, alt, eventType, loading = 'lazy', fetchPriority = 'auto' }: {
  url: string | null | undefined
  kind: ContentImageKind
  alt: string
  eventType?: string | null
  loading?: 'eager' | 'lazy'
  fetchPriority?: 'high' | 'low' | 'auto'
}) {
  const source = contentImageUrl(url)
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const fallback = !source || failedSource === source
  const fallbackSource = kind === 'event' && eventType
    ? `/assets/fallback/event-${categoryForType(eventType).key}.svg` : fallbackImages[kind]
  return <img
    src={fallback ? fallbackSource : source!}
    alt={fallback ? `${fallbackLabels[kind]} 이미지가 없습니다` : alt}
    data-fallback={fallback ? kind : undefined}
    style={fallback ? { objectFit: 'contain', backgroundColor: '#f1f2f4' } : undefined}
    loading={loading}
    fetchPriority={fetchPriority}
    referrerPolicy="no-referrer"
    onError={() => { if (!fallback) setFailedSource(source) }}
  />
}
