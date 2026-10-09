import type { ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({
  params: new URLSearchParams('category=subculture'),
  cells: [] as unknown[], cursor: 0,
  requests: [] as unknown[][],
  setParams: vi.fn(),
  remoteData: { items: [], total: 0 } as unknown, remoteLoading: false,
}))
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useEffect: () => {},
  useState: (initial: unknown) => {
    const index = fixture.cursor++
    if (!(index in fixture.cells)) fixture.cells[index] = typeof initial === 'function' ? initial() : initial
    return [fixture.cells[index], vi.fn()]
  },
  useMemo: (factory: () => unknown, deps: unknown[]) => {
    const index = fixture.cursor++
    const previous = fixture.cells[index] as { deps: unknown[]; value: unknown } | undefined
    if (!previous || deps.some((dep, i) => dep !== previous.deps[i])) fixture.cells[index] = { deps, value: factory() }
    return (fixture.cells[index] as { value: unknown }).value
  },
}))
vi.mock('react-router', () => ({
  Link: 'a', useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/discover', search: `?${fixture.params}` }),
  useSearchParams: () => [fixture.params, fixture.setParams],
}))
vi.mock('../../app/useRemote', () => ({ useRemote: (_namespace: string, _load: unknown, deps: unknown[]) => {
  fixture.requests.push(deps)
  return { data: fixture.remoteData, loading: fixture.remoteLoading, error: null, reload: vi.fn() }
} }))
vi.mock('../../app/useAuth', () => ({ useAuth: () => ({ status: 'anonymous', user: null }) }))
vi.mock('./useRecommendationViewer', () => ({ useRecommendationViewer: () => 'anonymous' }))
vi.mock('../visit/ScrollMemory', () => ({ usePageScroll: () => {} }))
vi.mock('./site', async original => ({ ...await original<typeof import('./site')>(), currentSiteCategory: () => '' }))

import { DiscoveryPage } from './DiscoveryPage'
import { HomeFeed } from './homeFeed'

type Node = ReactElement<Record<string, unknown>>
function nodes(value: ReactNode): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes)
  if (!value || typeof value !== 'object' || !('props' in value)) return []
  const node = value as Node
  return [node, ...nodes(node.props.children as ReactNode)]
}
function render() { fixture.cursor = 0; fixture.requests = []; return DiscoveryPage() }
function section(tree: ReactNode, id: string) {
  const node = nodes(tree).find(node => node.props.id === id)
  if (!node) throw new Error(`Missing section ${id}`)
  return node
}
function change(node: Node, region: string) { (node.props.changeRegion as (value: string) => void)(region) }

describe('home region tab isolation', () => {
  beforeEach(() => {
    fixture.params = new URLSearchParams('category=subculture')
    fixture.cells = []; fixture.cursor = 0
    fixture.remoteData = { items: [], total: 0 }; fixture.remoteLoading = false
    fixture.setParams.mockReset().mockImplementation((next: URLSearchParams) => { fixture.params = next })
  })

  it('changes only the clicked section, preserves scroll and leaves the hero/daily query untouched', () => {
    let tree = render()
    const rootRequests = fixture.requests.map(deps => [...deps])
    change(section(tree, 'ranking-heading'), 'SEOUL')
    expect(fixture.params.get('region')).toBeNull()
    expect(fixture.setParams.mock.calls[0][1]).toEqual({ preventScrollReset: true })
    tree = render()
    expect(section(tree, 'ranking-heading').props.region).toBe('SEOUL')
    expect(section(tree, 'closing-heading').props.region).toBe('')
    expect(fixture.requests).toEqual(rootRequests)
    change(section(tree, 'closing-heading'), 'GYEONGGI')
    tree = render()
    expect(section(tree, 'ranking-heading').props.region).toBe('SEOUL')
    expect(section(tree, 'closing-heading').props.region).toBe('GYEONGGI')
    expect(fixture.requests).toEqual(rootRequests)
  })

  it('links each section to its own region and restores its choices from the URL', () => {
    fixture.params = new URLSearchParams('category=subculture&region=GYEONGGI&openingRegion=SEOUL')
    let tree = render()
    const upcoming = section(tree, 'ranking-heading')
    expect(upcoming.props.region).toBe('SEOUL')
    const href = new URL(upcoming.props.allEventsHref as string, 'https://boothana.kr')
    expect(href.searchParams.get('region')).toBe('SEOUL')
    expect(href.searchParams.get('openingRegion')).toBeNull()
    expect(href.searchParams.get('closingRegion')).toBeNull()
    change(upcoming, '')
    tree = render()
    expect(section(tree, 'ranking-heading').props.region).toBe('')
    expect(fixture.params.get('region')).toBe('GYEONGGI')
  })

  it('renders a cached tab immediately even before the remote hook activates the new request scope', async () => {
    const node = section(render(), 'ranking-heading')
    const feed = new HomeFeed(async () => ({ items: [], page: 0, size: 100, total: 0 }))
    fixture.remoteData = null; fixture.remoteLoading = true
    const child = () => (node.type as (props: Record<string, unknown>) => ReactNode)({ ...node.props, feed })
    let tree = child()
    expect(nodes(tree).some(node => node.props['aria-busy'] === 'true')).toBe(true)
    const query = fixture.requests.at(-1)![0] as string
    await feed.load(query)
    tree = child()
    expect(nodes(tree).some(node => node.props['aria-busy'] === 'true')).toBe(false)
    expect(nodes(tree).some(node => node.props.className === 'ranking-empty')).toBe(true)
  })
})
