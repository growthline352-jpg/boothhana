import { afterEach, describe, expect, it, vi } from 'vitest'
import { PageMetadata } from './PageMetadata'

vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useEffect: (effect: () => void) => effect(),
}))
vi.mock('react-router', () => ({ useLocation: () => ({ pathname: '/discover/13', search: '' }) }))
vi.mock('../features/discovery/site', () => ({
  currentSiteOrigin: () => 'https://boothana.kr', categorySitesActive: () => false, isLocalPreview: () => true,
}))

function head(canonical = 'https://boothana.kr/discover/13') {
  const remove = vi.fn(), insert = vi.fn()
  vi.stubGlobal('document', {
    documentElement: { lang: 'ko' },
    head: { querySelector: () => ({ href: canonical }), querySelectorAll: () => [{ remove }], insertAdjacentHTML: insert },
  })
  return { remove, insert }
}

afterEach(() => vi.unstubAllGlobals())
describe('detail metadata effects', () => {
  it('leaves SSR title, canonical, robots, verification and schema untouched during loading or a transient failure', () => {
    const document = head()
    PageMetadata({ pending: true })
    expect(document.remove).not.toHaveBeenCalled()
    expect(document.insert).not.toHaveBeenCalled()
  })
  it('only replaces the head with noindex when absence is confirmed', () => {
    const document = head()
    PageMetadata({ pending: true, unavailable: true })
    expect(document.remove).toHaveBeenCalledOnce()
    expect(document.insert.mock.calls[0][1]).toContain('content="noindex,follow"')
  })
  it('replaces stale metadata after navigating to a different detail URL', () => {
    const document = head('https://boothana.kr/discover/12')
    PageMetadata({ pending: true })
    expect(document.insert.mock.calls[0][1]).toContain('href="https://boothana.kr/discover/13"')
    expect(document.insert.mock.calls[0][1]).toContain('content="index,follow"')
    expect(document.insert.mock.calls[0][1]).not.toContain('application/ld+json')
  })
})
