import type { ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthSnapshot } from '../../app/AuthSession'
import { ConsoleDraftStore } from '../../app/ConsoleDraftStore'
import type { InterestView } from './api'

// Run the actual draft hook/store and TSX handlers. The React hook boundaries
// are explicit; auth gates and layout are checked in the real browser.
const fixture = vi.hoisted(() => ({
  frame: { cells: [] as unknown[], cursor: 0 },
  auth: null as unknown as AuthSnapshot & { drafts: ConsoleDraftStore; refresh: ReturnType<typeof vi.fn>; getSnapshot: () => AuthSnapshot },
  save: vi.fn(),
}))
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useRef: (initial: unknown) => {
    const frame = fixture.frame, index = frame.cursor++
    if (!(index in frame.cells)) frame.cells[index] = { current: initial }
    return frame.cells[index]
  },
  useEffect: () => {},
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
}))
vi.mock('../../app/useAuth', () => ({ useAuth: () => fixture.auth }))
vi.mock('./api', async importOriginal => ({
  ...await importOriginal<typeof import('./api')>(),
  interestApi: { save: fixture.save },
}))
import { InterestForm } from './InterestSettings'

type Node = ReactElement<Record<string, unknown>>
function nodes(value: ReactNode): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes)
  if (!value || typeof value !== 'object' || !('props' in value)) return []
  const node = value as Node
  return [node, ...nodes(node.props.children as ReactNode)]
}
function text(value: ReactNode): string {
  if (Array.isArray(value)) return value.map(text).join('')
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (!value || typeof value !== 'object' || !('props' in value)) return ''
  return text((value as Node).props.children as ReactNode)
}
function input(tree: ReactNode, label: string): Node {
  const wrapper = nodes(tree).find(node => node.type === 'label' && text(node.props.children as ReactNode).includes(label))
  const result = wrapper && nodes(wrapper).find(node => node.type === 'input')
  if (!result) throw new Error(`Missing checkbox ${label}`)
  return result
}
function call(node: Node, handler: string, event: unknown = undefined) {
  return (node.props[handler] as (event: unknown) => unknown)(event)
}
const options = [{ code: 'SUBCULTURE', label: '서브컬처', formats: [{ code: 'BIRTHDAY_CAFE', label: '생일카페' }], topics: [{ code: 'VOCALOID', label: '보컬로이드' }] }]
const initial: InterestView = { userId: 1, revision: 3, onboardingStatus: 'DONE', fields: { SUBCULTURE: { formats: [], topics: [] } } }
function identify(status: AuthSnapshot['status'], id = 1) {
  fixture.auth.status = status
  fixture.auth.generation++
  fixture.auth.user = status === 'authenticated' ? { id, displayName: `회원 ${id}`, permissions: ['FAN'], onboardingRequired: false } as AuthSnapshot['user'] : null
  fixture.auth.drafts.observe(fixture.auth)
}
function render(view = initial, onSaved = vi.fn()) {
  fixture.frame.cursor = 0
  return InterestForm({ view, options, onboarding: false, onSaved })
}
function remount() { fixture.frame = { cells: [], cursor: 0 } }
function submit(tree: ReactNode) {
  const form = nodes(tree).find(node => node.type === 'form')!
  call(form, 'onSubmit', { preventDefault: vi.fn() })
}
async function flush() { await new Promise(resolve => setTimeout(resolve, 0)) }
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

describe('account interest drafts through identity rechecking', () => {
  beforeEach(() => {
    remount()
    fixture.save.mockReset()
    fixture.auth = { status: 'checking', user: null, error: '', generation: 0, drafts: new ConsoleDraftStore(),
      refresh: vi.fn(async () => {}), getSnapshot: () => fixture.auth }
    identify('authenticated')
  })

  it('retains unsaved selections after same-account rechecking and component remount', () => {
    call(input(render(), '보컬로이드'), 'onChange')
    identify('checking')
    const store = fixture.auth.drafts
    expect(store.lease('member-interests')).toBeNull()
    identify('error')
    expect(store.lease('member-interests')).toBeNull()
    identify('authenticated')
    remount()
    expect(input(render(), '보컬로이드').props.checked).toBe(true)
    expect(input(render(), '생일카페').props.checked).toBe(false)
  })

  it('discards drafts after a confirmed account change or logout', () => {
    call(input(render(), '보컬로이드'), 'onChange')
    identify('authenticated', 2)
    remount()
    expect(input(render({ ...initial, userId: 2 }), '보컬로이드').props.checked).toBe(false)
    identify('authenticated', 1)
    remount()
    call(input(render(), '보컬로이드'), 'onChange')
    identify('anonymous')
    identify('authenticated')
    remount()
    expect(input(render(), '보컬로이드').props.checked).toBe(false)
  })

  it('keeps one pending save locked across an auth gate and remount', async () => {
    const pending = deferred<InterestView>()
    fixture.save.mockReturnValue(pending.promise)
    submit(render())
    identify('checking')
    identify('authenticated')
    remount()
    const tree = render()
    expect(nodes(tree).find(node => node.type === 'button' && node.props.type === 'submit')?.props.disabled).toBe(true)
    submit(tree)
    expect(fixture.save).toHaveBeenCalledTimes(1)
    pending.resolve({ ...initial, revision: 4 })
    await flush()
    expect(fixture.auth.drafts.status(fixture.auth.drafts.lease('member-interests')).pending).toBe(false)
  })

  it('accepts a server acknowledgement received during rechecking without losing it', async () => {
    const pending = deferred<InterestView>(), saved = vi.fn()
    fixture.save.mockReturnValue(pending.promise)
    fixture.auth.refresh.mockImplementation(async () => { identify('authenticated') })
    call(input(render(initial, saved), '보컬로이드'), 'onChange')
    submit(render(initial, saved))
    identify('checking')
    const result = { ...initial, revision: 4, fields: { SUBCULTURE: { formats: [], topics: ['VOCALOID'] } } }
    pending.resolve(result)
    await flush()
    expect(saved).toHaveBeenCalledWith(result)
    expect(fixture.auth.refresh).toHaveBeenCalledTimes(1)
    remount()
    const tree = render(result)
    expect(input(tree, '보컬로이드').props.checked).toBe(true)
    expect(text(tree)).toContain('관심분야를 저장했습니다.')
  })

  it('does not apply a late acknowledgement to another account', async () => {
    const pending = deferred<InterestView>(), saved = vi.fn()
    fixture.save.mockReturnValue(pending.promise)
    submit(render(initial, saved))
    identify('authenticated', 2)
    pending.resolve({ ...initial, revision: 4 })
    await flush()
    expect(saved).not.toHaveBeenCalled()
    remount()
    const tree = render({ ...initial, userId: 2 })
    expect(text(tree)).not.toContain('관심분야를 저장했습니다.')
    expect(nodes(tree).find(node => node.type === 'button' && node.props.type === 'submit')?.props.disabled).toBe(false)
  })

  it('preserves the original revision when another screen updates settings', async () => {
    call(input(render(), '보컬로이드'), 'onChange')
    identify('checking')
    identify('authenticated')
    remount()
    fixture.save.mockRejectedValue(new Error('다른 화면에서 관심 설정이 바뀌었습니다.'))
    submit(render({ ...initial, revision: 4 }))
    await flush()
    expect(fixture.save.mock.calls[0][0].revision).toBe(3)
    expect(fixture.save.mock.calls[0][1].SUBCULTURE.topics).toEqual(['VOCALOID'])
    const tree = render({ ...initial, revision: 4 })
    expect(input(tree, '보컬로이드').props.checked).toBe(true)
    expect(text(tree)).toContain('다른 화면에서 관심 설정이 바뀌었습니다.')
  })

  it('blocks a direct stale submit while the account is unknown', () => {
    const tree = render()
    identify('checking')
    submit(tree)
    expect(fixture.save).not.toHaveBeenCalled()
  })
})
