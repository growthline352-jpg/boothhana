import { useState } from 'react'
import { contentImageUrl, fallbackImages, type ContentImageKind } from './contentImageSource'

const fallbackLabels: Record<ContentImageKind, string> = {
  event: '행사', booth: '부스', product: '상품',
}

export function ContentImage({ url, kind, alt, loading = 'lazy', fetchPriority = 'auto' }: {
  url: string | null | undefined
  kind: ContentImageKind
  alt: string
  loading?: 'eager' | 'lazy'
  fetchPriority?: 'high' | 'low' | 'auto'
}) {
  const source = contentImageUrl(url)
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const fallback = !source || failedSource === source
  return <img
    src={fallback ? fallbackImages[kind] : source!}
    alt={fallback ? `${fallbackLabels[kind]} 이미지가 없습니다` : alt}
    data-fallback={fallback ? kind : undefined}
    style={fallback ? { objectFit: 'contain', backgroundColor: '#f1f2f4' } : undefined}
    loading={loading}
    fetchPriority={fetchPriority}
    referrerPolicy="no-referrer"
    onError={() => { if (!fallback) setFailedSource(source) }}
  />
}
