import { describe, expect, it } from 'vitest'
import { homeQuickLinks } from './homeQuickLinks'

describe('homeQuickLinks', () => {
  it.each([
    ['subculture', 'COMIC_DOUJIN'],
    ['exhibitions', 'WINE'],
    ['festivals', 'MUSIC'],
  ] as const)('keeps every quick link inside the %s category', (category, featuredType) => {
    const links = homeQuickLinks(category)

    expect(links).toHaveLength(8)
    expect(links.every(link => new URLSearchParams(link.to.slice(1)).get('category') === category)).toBe(true)
    expect(links.some(link => new URLSearchParams(link.to.slice(1)).get('type') === featuredType)).toBe(true)
  })

  it('does not show subculture shortcuts in other categories', () => {
    for (const category of ['exhibitions', 'festivals'] as const) {
      const links = homeQuickLinks(category)
      expect(links.map(link => link.label)).not.toContain('생일카페')
      expect(links.map(link => link.label)).not.toContain('굿즈 행사')
    }
  })
})
