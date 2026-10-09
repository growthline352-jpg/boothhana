import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { creatorApi } from '../../api'
import { useRemote } from '../../app/useRemote'
import { useConsoleDraft } from '../../app/useConsoleDraft'
import { PageHeader } from '../../components/layout/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States'
import { ImageUploader } from '../../components/ui/ImageUploader'
import { StatusChip } from '../../components/ui/StatusChip'
import { formatPrice } from '../../utils/format'
import type { EventProduct } from '../../types'
import { CreatorDialog } from './CreatorDialog'
import { eventBoothLabel, eventDates } from './context'

// The preview File follows the account-scoped draft; it is never sent in the product DTO.
type ProductDraft = Partial<EventProduct> & { imagePreviewFile?: File }
const newProduct = (): ProductDraft => ({ name: '', description: '', imageKey: '', price: 0, stockMode: 'FINITE', stockQuantity: 0, soldOut: false, isPublic: true, reservationEnabled: true })
const draftKey = (product: Partial<EventProduct>) => String(product.id ?? 'new')
const content = (product: Partial<EventProduct>) => JSON.stringify([product.name ?? '', product.description ?? '', product.imageKey ?? '', product.price ?? 0, product.stockMode, product.stockQuantity, product.soldOut, product.isPublic, product.reservationEnabled])

export function CreatorProductsPage() {
  const { eventBoothId = '' } = useParams()
  // Remount all form state when navigating from one booth to another.
  return <ProductEditor key={eventBoothId} eventBoothId={eventBoothId} />
}
function ProductEditor({ eventBoothId }: { eventBoothId: string }) {
  const state = useRemote("features/creator/CreatorProductsPage:ProductEditor:state", () => creatorApi.products(eventBoothId), [eventBoothId])
  const booths = useRemote("features/creator/CreatorProductsPage:ProductEditor:booths", creatorApi.eventBooths, [])
  const events = useRemote("features/creator/CreatorProductsPage:ProductEditor:events", creatorApi.events, [])
  const booth = booths.data?.find(row => String(row.id) === eventBoothId)
  const event = events.data?.find(row => row.id === booth?.eventId)
  const [editing, setEditing, submission] = useConsoleDraft<ProductDraft | null>(`creator:products:${eventBoothId}`, null)
  const [held, setHeld] = useConsoleDraft<Record<string, ProductDraft>>(`creator:products:${eventBoothId}:held`, {})
  const [decision, setDecision] = useState<{ next: ProductDraft | null } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const busy = uploading || submission.pending || event?.status === 'ENDED'
  const original = editing?.id ? state.data?.find(row => row.id === editing.id) : newProduct()
  const dirty = !!editing && (!original || content(editing) !== content(original))
  useEffect(() => {
    if (!dirty && !Object.keys(held).length) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty, held])
  const open = (next: ProductDraft | null) => {
    setError('')
    if (!next) { setEditing(null); return }
    const key = draftKey(next)
    setEditing(held[key] ?? next)
    setHeld(current => Object.fromEntries(Object.entries(current).filter(([id]) => id !== key)))
  }
  const requestEdit = (next: ProductDraft | null) => {
    if (busy || (next && editing && draftKey(next) === draftKey(editing))) return
    if (dirty) setDecision({ next })
    else open(next)
  }
  const decide = (keep: boolean) => {
    if (!decision) return
    if (keep && editing) setHeld(current => ({ ...current, [draftKey(editing)]: editing }))
    open(decision.next); setDecision(null)
  }
  const save = async (event: FormEvent) => {
    event.preventDefault(); setError('')
    if (busy) return
    if (uploading || !editing?.name?.trim()) { setError('상품명과 이미지 업로드 상태를 확인해 주세요.'); return }
    if (!Number.isSafeInteger(editing.price) || (editing.price ?? -1) < 0 || (editing.price ?? 0) > 1_000_000_000
        || (editing.stockMode === 'FINITE' && (!Number.isSafeInteger(editing.stockQuantity) || (editing.stockQuantity ?? -1) < 0))) {
      setError('가격과 재고는 허용 범위의 0 이상 정수여야 합니다.'); return
    }
    if (!submission.begin()) return
    try {
      // Both version and productVersion came from the last server read; never synthesize an update revision.
      if (editing.id) await creatorApi.updateProduct(editing.id, editing)
      else await creatorApi.saveProduct(eventBoothId, editing)
      submission.saved(); await state.reload()
    } catch (caught) { submission.failed(caught) }
    finally { submission.finish() }
  }
  const remove = async (id: number) => {
    if (busy || !window.confirm('이 상품을 삭제할까요?') || !submission.begin()) return
    let removed = false
    try { await creatorApi.deleteProduct(id); removed = true; await state.reload() }
    catch (caught) { submission.failed(caught) }
    finally { submission.finish(); if (removed) { if (editing?.id === id) setEditing(null); setHeld(current => Object.fromEntries(Object.entries(current).filter(([key]) => key !== String(id)))) } }
  }
  const copy = async () => {
    if (busy || !submission.begin()) return
    try { await creatorApi.copyProducts(eventBoothId, []); await state.reload() }
    catch (caught) { submission.failed(caught) }
    finally { submission.finish() }
  }
  if (booths.loading || events.loading) return <LoadingState label="행사와 부스를 확인하고 있습니다" />
  if (booths.error || events.error) return <ErrorState error={booths.error ?? events.error!} retry={() => void Promise.all([booths.reload(), events.reload()])} />
  if (!booth) return <EmptyState title="행사 부스를 찾을 수 없습니다" description="내 부스 목록에서 관리할 부스를 선택해 주세요." action={<Link to="/creator/booths">내 부스 목록</Link>} />
  return <><nav className="creator-breadcrumb" aria-label="현재 관리 위치"><Link to="/creator/booths">내 부스</Link><span>›</span><Link to={`/creator/event-booths/${eventBoothId}`}>{booth.name}</Link><span>› 상품·재고</span></nav>
    <PageHeader eyebrow="Creator · Products" title="상품/재고 관리" description={`${eventBoothLabel(booth, events.data ?? [])} · ${eventDates(event)}`}
    actions={<><button className="btn secondary" disabled={busy} onClick={() => void copy()}>이전 상품 불러오기</button><button className="btn primary" disabled={busy} onClick={() => requestEdit(newProduct())}>상품 등록</button></>} />
    {event?.status === 'ENDED' && <p className="notice-banner">종료된 행사의 상품은 읽기 전용입니다.</p>}
    {(error || submission.error) && <div className="form-alert" role="alert">{error || submission.error}</div>}
      {submission.message && <p role="status">{submission.message}</p>}
    <p className="item-meta">닫을 때 ‘임시 보관’을 선택하면 이 탭에서 다시 이어 쓸 수 있습니다. 새로고침·탭 종료·로그아웃 시에는 사라집니다. 인증 확인으로 중단된 이미지 업로드는 다시 선택해 주세요.</p>
    {!!Object.keys(held).length && <section className="notice-banner" aria-label="임시 보관 상품"><strong>임시 보관 중</strong><div className="row-actions">{Object.entries(held).map(([id, product]) => <button className="btn secondary" disabled={busy} key={id} onClick={() => requestEdit(product)}>{product.name || '새 상품'} 이어 쓰기</button>)}</div></section>}
    {decision && <CreatorDialog title="작성 중인 상품을 어떻게 할까요?" close={() => setDecision(null)}><p>저장하지 않은 내용이 있습니다. 임시 보관한 내용은 이 탭에서 다시 이어 쓸 수 있습니다.</p><div className="row-actions"><button className="btn primary" onClick={() => setDecision(null)}>계속 작성</button><button className="btn secondary" onClick={() => decide(true)}>임시 보관</button><button className="btn danger subtle" onClick={() => decide(false)}>내용 버리기</button></div></CreatorDialog>}
    {editing && <form className="panel form-panel" onSubmit={(event) => void save(event)}>
      <div className="panel-header"><h2>상품 등록/수정</h2><button className="btn subtle" type="button" disabled={busy} onClick={() => requestEdit(null)}>닫기</button></div>
      {editing.id && <p className="item-meta">이전 행사에서 불러온 상품은 이름·설명·이미지를 공유합니다. 가격과 재고는 행사별로 관리합니다.</p>}
      <fieldset disabled={submission.pending || event?.status === 'ENDED'} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}><div className="form-grid">
        <label className="field"><span>상품명</span><input className="input" required maxLength={255} value={editing.name ?? ''} onChange={(event) => setEditing({ ...editing, name: event.target.value })} /></label>
        <label className="field"><span>가격</span><input className="input" type="number" required min="0" max="1000000000" step="1" value={editing.price ?? 0} onChange={(event) => setEditing({ ...editing, price: Number(event.target.value) })} /></label>
        <label className="field"><span>재고 방식</span><select className="select" value={editing.stockMode} onChange={(event) => setEditing({ ...editing, stockMode: event.target.value as EventProduct['stockMode'], stockQuantity: event.target.value === 'FINITE' ? editing.stockQuantity ?? 0 : null })}><option value="FINITE">유한 재고</option><option value="INFINITE">무한 재고</option></select></label>
        {editing.stockMode === 'FINITE' && <label className="field"><span>현재 재고</span><input className="input" type="number" required min="0" max="2147483647" step="1" value={editing.stockQuantity ?? 0} onChange={(event) => setEditing({ ...editing, stockQuantity: Number(event.target.value) })} /></label>}
        <ImageUploader key={editing.id ?? 'new'} target="product" disabled={submission.pending} currentUrl={editing.imageUrl} previewFile={editing.imagePreviewFile} onBusyChange={setUploading} onUploaded={(imageKey, imagePreviewFile) => setEditing(current => current ? { ...current, imageKey, imagePreviewFile } : null)} />
        <label className="field full"><span>상품 설명</span><textarea className="textarea" rows={4} value={editing.description ?? ''} onChange={(event) => setEditing({ ...editing, description: event.target.value })} /></label>
        <label className="check-field"><input type="checkbox" checked={editing.reservationEnabled ?? false} onChange={(event) => setEditing({ ...editing, reservationEnabled: event.target.checked })} /> 예약 가능</label>
        <label className="check-field"><input type="checkbox" checked={editing.isPublic ?? false} onChange={(event) => setEditing({ ...editing, isPublic: event.target.checked })} /> 공개</label>
        <label className="check-field"><input type="checkbox" checked={editing.soldOut ?? false} onChange={(event) => setEditing({ ...editing, soldOut: event.target.checked })} /> SOLD OUT</label>
      </div></fieldset><button className="btn primary" disabled={busy}>{submission.pending ? '저장 중…' : '상품 저장'}</button>
    </form>}
    {state.loading ? <LoadingState /> : state.error ? <ErrorState error={state.error} retry={() => void state.reload()} /> : !state.data?.length
      ? <EmptyState title="등록한 상품이 없습니다" description="새 상품을 등록하거나 이전 행사 상품을 불러오세요." />
      : <div className="table-wrap"><table><thead><tr><th>상품</th><th>가격</th><th>현재 재고</th><th>예약</th><th>상태</th><th>관리</th></tr></thead><tbody>{state.data.map(product => <tr key={product.id}><td><strong>{product.name}</strong><small>{product.description}</small></td><td>{formatPrice(product.price)}</td><td>{product.stockMode === 'INFINITE' ? '무한' : `${product.stockQuantity ?? 0}개`}</td><td>{product.reservationEnabled ? '가능' : '불가'}</td><td><StatusChip tone={product.soldOut ? 'warning' : product.isPublic ? 'active' : 'muted'}>{product.soldOut ? 'SOLD OUT' : product.isPublic ? '공개' : '숨김'}</StatusChip></td><td><div className="row-actions"><button className="btn subtle" disabled={busy} onClick={() => requestEdit(product)}>수정</button><button className="btn danger subtle" disabled={busy} onClick={() => void remove(product.id)}>삭제</button></div></td></tr>)}</tbody></table></div>}
  </>
}
