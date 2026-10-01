import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ContentImage } from './ContentImage'
import { contentImageUrl, fallbackImages } from './contentImageSource'

describe('ContentImage', () => {
  it('uses category-specific gray event icons and keeps real posters first', () => {
    for (const [eventType, category] of [['COMIC_DOUJIN', 'subculture'], ['WINE', 'exhibitions'], ['FOOD', 'festivals']] as const) {
      const fallback = renderToStaticMarkup(<ContentImage url={null} kind="event" eventType={eventType} alt=""/>)
      expect(fallback).toContain(`src="/assets/fallback/event-${category}.svg"`)
      const original = renderToStaticMarkup(<ContentImage url="https://example.com/poster.jpg" kind="event" eventType={eventType} alt="포스터"/>)
      expect(original).toContain('src="https://example.com/poster.jpg"')
      expect(original).not.toContain('data-fallback')
    }
  })
  it('uses separate local fallback images for missing event, booth and product media', () => {
    for (const kind of ['event', 'booth', 'product'] as const) {
      const html = renderToStaticMarkup(<ContentImage url={null} kind={kind} alt="" />)
      expect(html).toContain(`src="${fallbackImages[kind]}"`)
      expect(html).toContain(`data-fallback="${kind}"`)
      expect(html).toContain(`${{event:'행사',booth:'부스',product:'상품'}[kind]} 이미지가 없습니다`)
      expect(fallbackImages[kind]).toMatch(/\.svg$/)
    }
  })

  it('keeps valid originals and rejects invalid image URLs', () => {
    expect(contentImageUrl(' https://example.com/poster.jpg ')).toBe('https://example.com/poster.jpg')
    expect(contentImageUrl('/assets/example.png')).toBe('/assets/example.png')
    expect(contentImageUrl('javascript:alert(1)')).toBeNull()
    expect(contentImageUrl('//example.com/image.png')).toBeNull()
    expect(contentImageUrl('')).toBeNull()
    const html = renderToStaticMarkup(<ContentImage url="https://example.com/poster.jpg" kind="event" alt="행사 포스터" />)
    expect(html).toContain('src="https://example.com/poster.jpg"')
    expect(html).not.toContain('data-fallback')
  })
})
