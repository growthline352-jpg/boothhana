import type { ReactElement, ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { Consent } from './measurement'

const fixture = vi.hoisted(() => ({
  cells: [] as unknown[], cursor: 0, effects: [] as (() => void | (() => void))[],
  consent: null as Consent, measure: vi.fn(), pause: vi.fn(),
}))
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = fixture.cursor++
    if (!(index in fixture.cells)) fixture.cells[index] = typeof initial === 'function' ? initial() : initial
    return [fixture.cells[index], (next: unknown) => { fixture.cells[index] = next }]
  },
  useEffect: (effect: () => void | (() => void)) => { fixture.effects.push(effect) },
}))
vi.mock('react-router', () => ({ useLocation: () => ({ pathname: '/', search: '' }) }))
vi.mock('./consent', () => ({
  readConsent: () => fixture.consent,
  saveConsent: (value: Consent) => { fixture.consent = value },
}))
vi.mock('./measurement', () => ({
  publicPage: () => ({}), setMeasurement: fixture.measure, pauseMeasurement: fixture.pause,
}))
import { AnalyticsConsent } from './AnalyticsConsent'
type Node = ReactElement<Record<string, unknown>>
function nodes(value: ReactNode): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes)
  if (!value || typeof value !== 'object' || !('props' in value)) return []
  const node = value as Node
  return [node, ...nodes(node.props.children as ReactNode)]
}
function render() { fixture.cursor = 0; fixture.effects = []; return nodes(AnalyticsConsent()) }
function click(tree: Node[], text: string) {
  const node = tree.find(n => n.type === 'button' && n.props.children === text)!
  ;(node.props.onClick as () => void)()
}
const notice = (tree: Node[]) => tree.some(n => n.props.id === 'analytics-notice')
beforeEach(() => {
  fixture.cells = []; fixture.consent = null; vi.clearAllMocks()
  vi.stubGlobal('window', { location: { href: 'https://boothana.kr/' } })
  vi.stubGlobal('document', { cookie: '' })
})
it.each(['granted', 'denied'] as const)('does not automatically reopen for a saved %s choice', value => {
  fixture.consent = value
  expect(notice(render())).toBe(false)
  fixture.cells = [] // New layout mount, e.g. navigation away and back.
  expect(notice(render())).toBe(false)
  click(render(), '방문 통계 설정'); expect(notice(render())).toBe(true)
  click(render(), '방문 통계 설정'); expect(notice(render())).toBe(false)
})
it.each(['분석 허용', '거절'])('closes after choosing %s and retains the result on remount', text => {
  expect(notice(render())).toBe(true)
  click(render(), text)
  expect(notice(render())).toBe(false)
  fixture.cells = []
  expect(notice(render())).toBe(false)
})
it('uses the latest shared choice before measuring a changed route', () => {
  fixture.consent = 'granted'; render()
  fixture.consent = 'denied' // A different domain/tab withdrew consent.
  fixture.effects[0]()
  expect(fixture.measure).toHaveBeenLastCalledWith('denied', 'https://boothana.kr/')
  expect(fixture.cells[0]).toBe('denied')
})
it('synchronizes on returning to a tab and removes listeners on unmount', () => {
  const handlers = new Map<string, () => void>()
  const add = (name: string, fn: () => void) => handlers.set(name, fn)
  const remove = vi.fn()
  vi.stubGlobal('window', { location: { href: 'https://boothana.kr/' }, addEventListener: add, removeEventListener: remove })
  vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: add, removeEventListener: remove })
  fixture.consent = 'granted'; render()
  const cleanup = fixture.effects[1]()!
  fixture.consent = 'denied'; handlers.get('focus')!()
  expect(fixture.measure).toHaveBeenLastCalledWith('denied', 'https://boothana.kr/')
  expect(fixture.cells[0]).toBe('denied')
  cleanup()
  expect(remove).toHaveBeenCalledTimes(3)
  expect(fixture.pause).toHaveBeenCalledOnce()
})
