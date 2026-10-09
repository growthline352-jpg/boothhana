import type { ComponentProps, ReactElement, ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConsoleDraftStore } from '../../app/ConsoleDraftStore'
import type { EventProduct, Reservation } from '../../types'

// Execute the actual TSX handlers and effect cleanup in Node. Network calls and
// hook scheduling are explicit boundaries; no production data is used.
const fixture = vi.hoisted(() => ({
  frame: {
    cells: [] as unknown[], cursor: 0, dirty: false,
    effects: new Map<number, { deps?: unknown[]; cleanup?: () => void }>(),
    pending: [] as (() => void)[],
  },
  store: null as ConsoleDraftStore | null,
  reservations: [] as Reservation[], products: [] as EventProduct[],
  api: { reservations: vi.fn(), pickup: vi.fn(), eventBooths: vi.fn(), events: vi.fn(), products: vi.fn(), updateProduct: vi.fn(), saveProduct: vi.fn() },
  reload: vi.fn(), upload: vi.fn(),
}))

vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState(initial: unknown) {
    const frame = fixture.frame, index = frame.cursor++
    if (!(index in frame.cells)) frame.cells[index] = typeof initial === 'function' ? initial() : initial
    return [frame.cells[index], (value: unknown) => {
      const next = typeof value === 'function' ? value(frame.cells[index]) : value
      if (!Object.is(next, frame.cells[index])) { frame.cells[index] = next; frame.dirty = true }
    }]
  },
  useRef(initial: unknown) {
    const frame = fixture.frame, index = frame.cursor++
    if (!(index in frame.cells)) frame.cells[index] = { current: initial }
    return frame.cells[index]
  },
  useEffect(effect: () => void | (() => void), deps?: unknown[]) {
    const frame = fixture.frame, index = frame.cursor++, previous = frame.effects.get(index)
    if (previous && deps && previous.deps?.length === deps.length && deps.every((value, i) => Object.is(value, previous.deps![i]))) return
    frame.pending.push(() => {
      previous?.cleanup?.()
      frame.effects.set(index, { deps, cleanup: effect() || undefined })
    })
  },
}))
vi.mock('../../api', () => ({ creatorApi: fixture.api }))
vi.mock('../../api/image-upload', () => ({ createImageUploadTask: () => ({ run: fixture.upload }) }))
vi.mock('react-router', () => ({ Link: 'a', useParams: () => ({ eventBoothId: '201' }) }))
vi.mock('../../app/useRemote', () => ({ useRemote: (_namespace: string, load: unknown) => ({
  loading: false, error: null, reload: fixture.reload,
  data: load === fixture.api.reservations ? fixture.reservations
    : load === fixture.api.events ? [{ id: 101, name: 'Test event', startAt: '2026-10-01', endAt: '2026-10-02', status: 'PUBLISHED' }]
    : load === fixture.api.eventBooths ? [{ id: 201, eventId: 101, name: 'Test booth' }] : fixture.products,
}) }))
vi.mock('../../app/useConsoleDraft', () => ({ useConsoleDraft: (key: string, initial: unknown) => {
  const store = fixture.store!, lease = store.lease(key)
  return [store.read(lease, initial), (value: unknown) => store.set(lease, typeof value === 'function' ? value(store.read(lease, initial)) : value), {
    ...store.status(lease), begin: () => store.begin(lease), saved: () => store.saved(lease),
    failed: (error: Error) => store.failed(lease, error.message), finish: () => store.finish(lease),
  }]
} }))

import { ImageUploader } from '../../components/ui/ImageUploader'
import { CreatorReservationsPage } from './CreatorReservationsPage'
import { CreatorProductsPage } from './CreatorProductsPage'

type Frame = typeof fixture.frame
type Node = ReactElement<Record<string, unknown>>
const frame = (): Frame => ({ cells: [], cursor: 0, dirty: false, effects: new Map(), pending: [] })
function render(component: () => ReactNode, state: Frame): ReactNode {
  let tree: ReactNode
  for (let count = 0; count < 10; count++) {
    fixture.frame = state; state.cursor = 0; state.dirty = false
    tree = component()
    state.pending.splice(0).forEach(effect => effect())
    if (!state.dirty) return tree
  }
  throw new Error('Unexpected render loop')
}
function unmount(state: Frame) { state.effects.forEach(effect => effect.cleanup?.()); state.effects.clear() }
function nodes(value: ReactNode): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes)
  if (!value || typeof value !== 'object' || !('props' in value)) return []
  const node = value as Node
  return [node, ...nodes(node.props.children as ReactNode), ...nodes(node.props.actions as ReactNode)]
}
function find(tree: ReactNode, predicate: (node: Node) => boolean): Node {
  const node = nodes(tree).find(predicate)
  if (!node) throw new Error('Missing test element')
  return node
}
const button = (tree: ReactNode, label: string) => find(tree, node => node.type === 'button' && node.props.children === label)
const call = (node: Node, name: string, value?: unknown) => (node.props[name] as (value: unknown) => unknown)(value)
const flush = () => new Promise(resolve => setTimeout(resolve, 0))
function productPage() {
  const view = CreatorProductsPage() as ReactElement<{ eventBoothId: string }>
  return (view.type as (props: { eventBoothId: string }) => ReactNode)(view.props)
}

beforeEach(() => {
  vi.clearAllMocks()
  fixture.store = new ConsoleDraftStore()
  fixture.store.observe({ status: 'authenticated', user: { id: 1, displayName: 'Test', permissions: ['CREATOR'] }, generation: 1, error: '' })
  fixture.reservations = [{ id: 501, reservationNo: 'RSV-501', eventBoothId: 201, eventName: 'Test event', boothName: 'Test booth', status: 'RESERVED', qrToken: '', createdAt: '', items: [] }]
  fixture.products = [{ id: 301, eventBoothId: 201, name: 'Product', description: '', imageKey: 'product/old.png', imageUrl: 'https://images.example/old.png', price: 1000, stockMode: 'FINITE', stockQuantity: 5, isPublic: true, soldOut: false, reservationEnabled: true, version: 1, productVersion: 1 }]
  fixture.upload.mockResolvedValue('product/new.png')
  fixture.api.updateProduct.mockResolvedValue({})
  fixture.api.saveProduct.mockResolvedValue({})
  fixture.reload.mockResolvedValue(undefined)
  vi.stubGlobal('window', { confirm: () => true, addEventListener: vi.fn(), removeEventListener: vi.fn() })
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('creator review regressions', () => {
  it.each(['CANCELED', 'PICKED_UP', 'RESERVED'] as const)('reports the returned pickup status: %s', async status => {
    fixture.api.pickup.mockResolvedValue({ ...fixture.reservations[0], status })
    const state = frame(), draw = () => render(CreatorReservationsPage, state)
    call(button(draw(), 'RSV-501'), 'onClick')
    call(button(draw(), '수령 완료 처리'), 'onClick')
    await flush()
    const tree = draw(), message = find(tree, node => node.type === 'p' && node.props.role === 'status').props.children
    expect(fixture.api.pickup).toHaveBeenCalledExactlyOnceWith(501)
    expect(message === '수령 완료로 기록했습니다.').toBe(status === 'PICKED_UP')
    if (status === 'CANCELED') expect(message).toContain('취소된 예약')
    expect(button(tree, '수령 완료 처리').props.disabled).toBe(status !== 'RESERVED')
    expect(fixture.reload).toHaveBeenCalledOnce()
    unmount(state)
  })

  it.each([false, true])('restores the uploaded image with its draft (new product: %s)', async isNew => {
    let nextUrl = 0
    const created = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:preview-${++nextUrl}`)
    const revoked = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const state = frame(), draw = () => render(productPage, state)
    call(button(draw(), isNew ? '상품 등록' : '수정'), 'onClick')
    const uploaderProps = () => find(draw(), node => node.type === ImageUploader).props as unknown as ComponentProps<typeof ImageUploader>
    const file = new File(['new image'], 'new.png', { type: 'image/png' })
    const uploadState = frame(), initialProps = uploaderProps()
    const uploadTree = render(() => ImageUploader(initialProps), uploadState)
    call(find(uploadTree, node => node.type === 'input'), 'onChange', { target: { files: [file], value: 'new.png' } })
    await flush()
    // Synchronize the parent draft and the uploader effect after upload completion.
    const updatedProps = uploaderProps()
    render(() => ImageUploader(updatedProps), uploadState)
    expect(updatedProps.previewFile).toBe(file)
    call(button(draw(), '닫기'), 'onClick')
    call(button(draw(), '임시 보관'), 'onClick')
    unmount(uploadState)
    expect(revoked).toHaveBeenCalledWith(created.mock.results.at(-1)!.value)
    const held = fixture.store!.read<Record<string, { imageKey: string; imagePreviewFile: File }>>(fixture.store!.lease('creator:products:201:held'), {})
    expect(Object.values(held)[0]).toMatchObject({ imageKey: 'product/new.png', imagePreviewFile: file })
    call(find(draw(), node => node.type === 'button' && Array.isArray(node.props.children) && node.props.children.includes(' 이어 쓰기')), 'onClick')
    const restoredProps = uploaderProps(), restoredState = frame()
    const restored = render(() => ImageUploader(restoredProps), restoredState)
    expect(restoredProps.previewFile).toBe(file)
    expect(find(restored, node => node.type === 'img').props.src).toBe(created.mock.results.at(-1)!.value)
    expect(created.mock.calls.at(-1)![0]).toBe(file)
    // The submitted image key still identifies the previewed upload.
    if (isNew) call(find(draw(), node => node.type === 'input' && node.props.maxLength === 255), 'onChange', { target: { value: 'New product' } })
    call(find(draw(), node => node.type === 'form'), 'onSubmit', { preventDefault() {} })
    await flush()
    const save = isNew ? fixture.api.saveProduct : fixture.api.updateProduct
    expect(save).toHaveBeenCalledOnce()
    expect(save.mock.calls[0][1].imageKey).toBe('product/new.png')
    unmount(restoredState); unmount(state)
    for (const result of created.mock.results) expect(revoked).toHaveBeenCalledWith(result.value)
    fixture.store!.reset()
    expect(fixture.store!.read(fixture.store!.lease('creator:products:201:held'), null)).toBeNull()
  })
})
