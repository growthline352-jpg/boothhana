import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { HomeGuide } from './HomeGuide'
import { renderHomeGuide } from '../../seo/home-guide.mjs'

describe('homepage service guide', () => {
  it('ships the same collapsed, crawlable content before and after React loads', () => {
    const client = renderToStaticMarkup(<HomeGuide />)
    const server = renderHomeGuide()
    expect(client).toBe(server)
    expect(client).toContain('<details class="home-guide"><summary>')
    expect(client).not.toContain('<details open')
    expect(client).toContain('부스하나(Boothana)')
    for (const host of ['subculture', 'expo', 'festival', 'popup']) {
      expect(client).toContain(`href="https://${host}.boothana.kr/discover?period=all&amp;sort=recent"`)
    }
    expect(client).toContain('href="/about"')
  })
})
