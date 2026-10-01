import type { ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TicketInput } from './api'

// Exercise the shipped TSX event handlers in Node. Hooks and network calls are
// explicit boundaries; native dialog focus/layout are verified in browser QA.
const fixture = vi.hoisted(() => ({
  frame: { cells: [] as unknown[], cursor: 0 },
  auth: { status: 'anonymous', user: null as { id: number } | null, refresh: vi.fn() },
  options: { data: { feedbackEnabled: true }, loading: false, error: null as Error | null, reload: vi.fn() },
  api: { feedback: vi.fn(), create: vi.fn(), options: vi.fn() },
}))

vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState: (initial: unknown) => {
    const frame = fixture.frame, index = frame.cursor++
    if (!(index in frame.cells)) frame.cells[index] = typeof initial === 'function' ? initial() : initial
    return [frame.cells[index], (next: unknown) => {
      frame.cells[index] = typeof next === 'function' ? next(frame.cells[index]) : next
    }]
  },
  useRef: (initial: unknown) => {
    const frame = fixture.frame, index = frame.cursor++
    if (!(index in frame.cells)) frame.cells[index] = { current: initial }
    return frame.cells[index]
  },
  useEffect: () => {},
}))
vi.mock('../../app/useAuth', () => ({ useAuth: () => fixture.auth }))
vi.mock('../../app/useRemote', () => ({ useRemote: () => fixture.options }))
vi.mock('react-router', () => ({
  useLocation: () => ({ pathname: '/discover' }),
  Link: 'a',
}))
vi.mock('./api', () => ({ supportApi: fixture.api }))

import { FeedbackDialog, FeedbackWidget } from './FeedbackWidget'

type Node = ReactElement<Record<string, unknown>>
function nodes(value: ReactNode): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes)
  if (!value || typeof value !== 'object' || !('props' in value)) return []
  const element = value as Node
  return [element, ...nodes(element.props.children as ReactNode)]
}
function find(tree: ReactNode, type: string, name?: string, value?: unknown): Node {
  const result = nodes(tree).find(element => element.type === type && (!name || element.props[name] === value))
  if (!result) throw new Error(`Missing ${type} ${name ?? ''}`)
  return result
}
function call(node: Node, name: string, event: unknown = undefined) {
  return (node.props[name] as (event: unknown) => unknown)(event)
}
function renderDialog(open = true, setOpen = vi.fn()) {
  fixture.frame.cursor = 0
  return FeedbackDialog({ open, setOpen })
}
function fill(title = ' 캘린더 개선 ', body = ' 선택한 날짜에 맞는 일정을 보고 싶어요. ') {
  let tree = renderDialog()
  call(find(tree, 'input', 'maxLength', 160), 'onChange', { target: { value: title } })
  tree = renderDialog()
  call(find(tree, 'textarea'), 'onChange', { target: { value: body } })
  return renderDialog()
}
const submitEvent = () => ({ preventDefault: vi.fn() })
async function flush() { await new Promise(resolve => setTimeout(resolve, 0)) }
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

describe('feedback TSX handlers with mocked hooks and API', () => {
  beforeEach(() => {
    fixture.frame = { cells: [], cursor: 0 }
    fixture.auth = { status: 'anonymous', user: null, refresh: vi.fn() }
    fixture.options = { data: { feedbackEnabled: true }, loading: false, error: null, reload: vi.fn() }
    vi.clearAllMocks()
    fixture.api.feedback.mockReset()
    fixture.api.create.mockReset()
  })

  it('retains the confirmed dialog identity through auth checks and resets for another account', () => {
    const key = () => {
      fixture.frame.cursor = 0
      const tree = FeedbackWidget({ open: true, setOpen: vi.fn() })
      return nodes(tree).find(element => element.type === FeedbackDialog)?.key
    }
    const original = key()
    expect(original).toBe('anonymous')
    for (const status of ['checking', 'error', 'anonymous']) {
      fixture.auth.status = status
      expect(key()).toBe(original)
    }
    fixture.auth = { ...fixture.auth, status: 'authenticated', user: { id: 10 } }
    expect(key()).toBe('member:10')
    fixture.auth.status = 'checking'; fixture.auth.user = null
    expect(key()).toBe('member:10')
    fixture.auth = { ...fixture.auth, status: 'authenticated', user: { id: 11 } }
    expect(key()).toBe('member:11')
  })

  it('retries an ambiguous create using the same request ID, access key and frozen body', async () => {
    fixture.api.feedback.mockRejectedValueOnce(new Error('Response lost'))
      .mockImplementationOnce(async (input: TicketInput) => ({ id: input.requestId, number: 'BH-RECEIPT' }))
    let tree = fill()
    call(find(tree, 'form'), 'onSubmit', submitEvent())
    await flush()
    tree = renderDialog()
    expect(find(tree, 'textarea').props.disabled).toBe(true)
    expect(find(tree, 'input', 'maxLength', 160).props.disabled).toBe(true)
    const first = fixture.api.feedback.mock.calls[0]
    expect(first[0]).toMatchObject({ title: '캘린더 개선', body: '선택한 날짜에 맞는 일정을 보고 싶어요.', category: 'FEATURE_REQUEST', context: { pagePath: '/discover' } })
    expect(first[1]).toMatch(/^[A-Za-z0-9_-]{43}$/)
    // Even a direct handler invocation bypassing disabled HTML cannot replace
    // the already-sent body. The same immutable payload must be retried.
    call(find(tree, 'textarea'), 'onChange', { target: { value: '다른 내용으로 수정해도 기존 요청을 확인해야 합니다.' } })
    tree = renderDialog()
    call(find(tree, 'form'), 'onSubmit', submitEvent())
    await flush()
    expect(fixture.api.feedback).toHaveBeenCalledTimes(2)
    expect(fixture.api.feedback.mock.calls[1]).toEqual(first)
    expect(nodes(renderDialog()).some(element => element.props.className === 'feedback-receipt')).toBe(true)
  })

  it('admits one request for rapid concurrent submits and prevents closing the pending write', async () => {
    const pending = deferred<{ id: string; number: string }>()
    fixture.api.feedback.mockReturnValue(pending.promise)
    const setOpen = vi.fn()
    let tree = fill()
    const form = find(tree, 'form')
    call(form, 'onSubmit', submitEvent())
    call(form, 'onSubmit', submitEvent())
    expect(fixture.api.feedback).toHaveBeenCalledTimes(1)
    tree = renderDialog(true, setOpen)
    call(find(tree, 'button', 'aria-label', '개선 의견 닫기'), 'onClick')
    expect(setOpen).not.toHaveBeenCalled()
    const input = fixture.api.feedback.mock.calls[0][0] as TicketInput
    pending.resolve({ id: input.requestId, number: 'BH-RECEIPT' })
    await flush()
    expect(find(renderDialog(), 'button', 'aria-label', '개선 의견 닫기').props.disabled).toBe(false)
  })

  it('blocks the actual submit handler when anonymous intake is disabled or identity is unknown', async () => {
    let tree = fill()
    fixture.options.data.feedbackEnabled = false
    tree = renderDialog()
    call(find(tree, 'form'), 'onSubmit', submitEvent())
    expect(find(tree, 'button', 'type', 'submit').props.disabled).toBe(true)
    expect(fixture.api.feedback).not.toHaveBeenCalled()
    fixture.options.data.feedbackEnabled = true
    for (const status of ['checking', 'error']) {
      fixture.auth.status = status
      tree = renderDialog()
      call(find(tree, 'form'), 'onSubmit', submitEvent())
      expect(find(tree, 'div', 'hidden', true)).toBeDefined()
    }
    await flush()
    expect(fixture.api.feedback).not.toHaveBeenCalled()
    expect(fixture.api.create).not.toHaveBeenCalled()
  })

  it('preserves the draft on close, reopen and same-account identity rechecking', () => {
    const title = '작성 중인 개선 의견', body = '작성 중인 비공개 내용을 유지해야 합니다.'
    fill(title, body)
    const setOpen = vi.fn()
    let tree = renderDialog(true, setOpen)
    call(find(tree, 'button', 'aria-label', '개선 의견 닫기'), 'onClick')
    expect(setOpen).toHaveBeenCalledWith(false)
    renderDialog(false, setOpen)
    tree = renderDialog(true, setOpen)
    expect(find(tree, 'input', 'maxLength', 160).props.value).toBe(title)
    expect(find(tree, 'textarea').props.value).toBe(body)
    fixture.auth.status = 'checking'
    expect(find(renderDialog(), 'div', 'hidden', true)).toBeDefined()
    fixture.auth.status = 'anonymous'
    tree = renderDialog()
    expect(find(tree, 'textarea').props.value).toBe(body)
  })

  it('routes a member suggestion into existing own-ticket history', async () => {
    fixture.auth = { ...fixture.auth, status: 'authenticated', user: { id: 10 } }
    fixture.api.create.mockImplementation(async (input: TicketInput) => ({ id: input.requestId, number: 'BH-MEMBER' }))
    const tree = fill()
    call(find(tree, 'form'), 'onSubmit', submitEvent())
    await flush()
    expect(fixture.api.create).toHaveBeenCalledTimes(1)
    expect(fixture.api.feedback).not.toHaveBeenCalled()
    const input = fixture.api.create.mock.calls[0][0] as TicketInput
    expect(find(renderDialog(), 'a').props.to).toBe(`/support/tickets/${input.requestId}`)
  })
})
