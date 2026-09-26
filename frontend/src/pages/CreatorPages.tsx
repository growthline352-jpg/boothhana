import { useTradeSubmission } from '../features/trade/useTradeSubmission'
import { tradeAttemptKey } from '../features/trade/submission'
import { TradeRecovery } from '../features/trade/TradeRecovery'
import { useAuth } from '../app/useAuth'
import { DiscoveryIcon } from '../features/discovery/DiscoveryIcon'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { creatorApi } from '../api'
import { useRemote } from '../app/useRemote'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { PageHeader } from '../components/layout/PageHeader'
import { StatusChip } from '../components/ui/StatusChip'
import { formatPrice } from '../utils/format'
import type { BoothNotice, BoothSummary, EventSummary, ReservationItem } from '../types'


function eventBoothLabel(booth: BoothSummary, events?: EventSummary[] | null) {
  const event = events?.find((item) => item.id === booth.eventId)
  return event ? `${booth.name} · ${event.name}` : booth.name
}

function paymentMethodLabel(value: 'CASH' | 'TRANSFER' | 'OTHER') {
  return value === 'CASH' ? '현금' : value === 'TRANSFER' ? '계좌이체' : '기타'
}

export function CreatorHomePage() {
  const tasks = [
    { to: '/creator/events', step: '01', title: '참가할 행사 찾기', description: '행사 안내를 확인하고 내 부스로 참가를 신청하세요.', icon: 'calendar' as const },
    { to: '/creator/booths', step: '02', title: '내 부스 준비하기', description: '소개와 상품, 재고를 확인하고 방문객에게 보여주세요.', icon: 'grid' as const },
    { to: '/creator/reservations', step: '03', title: '예약 수령 확인하기', description: '예약번호를 찾아 상품 전달 후 수령 완료로 기록하세요.', icon: 'ticket' as const },
    { to: '/creator/pos', step: '04', title: '현장 판매 기록하기', description: '실제 결제는 별도로 진행하고 판매 내역을 기록하세요.', icon: 'check' as const },
  ]
  return <><PageHeader eyebrow="Creator · Dashboard" title="크리에이터 홈" description="행사 준비와 현장 운영, 필요한 작업부터 시작하세요." />
    <div className="creator-welcome"><div><span className="eyebrow">내 부스를 위한 작업 공간</span><h2>준비부터 현장까지,<br/>하나씩 차근차근.</h2><p>처음이라면 기본 부스를 만든 뒤 행사에 참가해 보세요.</p></div><Link className="btn primary" to="/creator/booths">내 부스 관리 <DiscoveryIcon name="arrow" size={18}/></Link></div>
    <div className="creator-task-grid">{tasks.map(task=><Link key={task.to} className="creator-task-card" to={task.to}><div className="creator-task-top"><span className="creator-task-icon"><DiscoveryIcon name={task.icon} size={24}/></span><span>{task.step}</span></div><h2>{task.title}</h2><p>{task.description}</p><span className="creator-task-link">이동하기 <DiscoveryIcon name="arrow" size={18}/></span></Link>)}</div></>
}

export { CreatorEventsPage } from '../features/creator/CreatorEventsPage'

export { CreatorBoothsPage } from '../features/creator/CreatorBoothsPage'

export function CreatorEventBoothPage() {
  const { eventBoothId = '' } = useParams()
  const navigate = useNavigate()
  const booths = useRemote(creatorApi.eventBooths, [])
  const events = useRemote(creatorApi.events, [])
  const booth = booths.data?.find((item) => String(item.id) === eventBoothId)
  const event = events.data?.find((item) => item.id === booth?.eventId)
  const [loadedId, setLoadedId] = useState<number | null>(null)
  const [form, setForm] = useState({ boothNumber: '', intro: '', isPublic: false })
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  useEffect(() => {
    if (booth && booth.id !== loadedId) {
      setForm({ boothNumber: booth.boothNumber, intro: booth.intro, isPublic: booth.isPublic })
      setLoadedId(booth.id)
    }
  }, [booth, loadedId])
  const ended = event?.status === 'ENDED'
  const save = async (submitEvent: FormEvent) => {
    submitEvent.preventDefault()
    if (!booth) return
    setMessage(''); setSubmitting(true)
    try {
      const saved = await creatorApi.updateEventBooth(booth.id, form)
      setForm({ boothNumber: saved.boothNumber, intro: saved.intro, isPublic: saved.isPublic })
      await booths.reload()
      setMessage('행사별 부스 정보를 저장했습니다.')
    }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : '행사별 부스 정보를 저장하지 못했습니다.') }
    finally { setSubmitting(false) }
  }
  const remove = async () => {
    if (!booth || !window.confirm('이 행사에서 부스를 삭제할까요? 기본 부스 정보는 유지됩니다.')) return
    setMessage('')
    try { await creatorApi.deleteEventBooth(booth.id); navigate('/creator/booths') }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : '행사별 부스를 삭제하지 못했습니다.') }
  }
  if (booths.loading || events.loading) return <LoadingState label="행사별 부스 정보를 불러오고 있습니다" />
  if (booths.error || events.error) return <ErrorState error={booths.error ?? events.error ?? new Error('행사별 부스 정보를 불러오지 못했습니다.')} retry={() => void Promise.all([booths.reload(), events.reload()])} />
  if (!booth) return <EmptyState title="행사별 부스를 찾을 수 없습니다" description="내 부스 목록에서 승인된 행사 부스를 다시 선택해 주세요." />
  return <><PageHeader eyebrow="Creator · Event Booth" title={booth.name} description={`${event?.name ?? '행사'}에서 공개할 부스 번호와 소개를 관리합니다.`} actions={<Link className="btn secondary" to="/creator/booths">목록으로</Link>} />{ended && <div className="notice-banner">종료된 행사의 부스 정보는 읽기 전용입니다.</div>}{message && <div className="form-alert">{message}</div>}<form className="panel form-panel wide-form" onSubmit={(submitEvent) => void save(submitEvent)}><div className="form-grid"><label className="field"><span>부스 번호</span><input className="input" required disabled={ended} value={form.boothNumber} onChange={(changeEvent) => setForm({ ...form, boothNumber: changeEvent.target.value })} /></label><label className="check-field"><input type="checkbox" disabled={ended} checked={form.isPublic} onChange={(changeEvent) => setForm({ ...form, isPublic: changeEvent.target.checked })} /> 팬 화면에 공개</label><label className="field full"><span>행사별 부스 소개</span><textarea className="textarea" rows={7} disabled={ended} value={form.intro} onChange={(changeEvent) => setForm({ ...form, intro: changeEvent.target.value })} /></label></div><div className="panel-actions"><button className="btn danger subtle" type="button" disabled={ended || submitting} onClick={() => void remove()}>행사 부스 삭제</button><button className="btn primary" disabled={ended || submitting}>{submitting ? '저장 중…' : '변경 저장'}</button></div></form></>
}

export { CreatorProductsPage } from '../features/creator/CreatorProductsPage'

export function CreatorReservationsPage() {
  const state = useRemote(creatorApi.reservations, [])
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<Awaited<ReturnType<typeof creatorApi.reservationByNumber>> | null>(null)
  const [message, setMessage] = useState('')
  const search = async (event: FormEvent) => { event.preventDefault(); setMessage(''); try { setFound(await creatorApi.reservationByNumber(query)) } catch (caught) { setFound(null); setMessage(caught instanceof Error ? caught.message : '예약을 찾지 못했습니다.') } }
  const pickup = async (id: number) => { if (!window.confirm('상품을 전달하고 수령 완료로 변경할까요?')) return; try { setFound(await creatorApi.pickup(id)); await state.reload() } catch (caught) { setMessage(caught instanceof Error ? caught.message : '수령 처리하지 못했습니다.') } }
  return <><PageHeader eyebrow="Creator · Reservations" title="예약번호 검색/수령 처리" description="팬이 보여주는 예약번호를 검색하고 상품 전달 후 수령 완료 처리합니다." /><form className="search-panel" onSubmit={(event) => void search(event)}><input className="input" required value={query} onChange={(event) => setQuery(event.target.value)} placeholder="예: RSV-260718-042" aria-label="예약번호 검색" /><button className="btn primary">검색</button></form>{message && <div className="form-alert">{message}</div>}{found && <article className="panel pickup-card"><div><p className="eyebrow mono">{found.reservationNo}</p><h2>{found.boothName}</h2><p>{found.items.map((item) => `${item.productName ?? item.eventProductId} × ${item.quantity}`).join(', ')}</p></div><div className="row-actions"><StatusChip tone={found.status === 'RESERVED' ? 'active' : 'muted'}>{found.status === 'RESERVED' ? '예약' : found.status === 'PICKED_UP' ? '수령 완료' : '취소'}</StatusChip><button className="btn primary" disabled={found.status !== 'RESERVED'} onClick={() => void pickup(found.id)}>수령 완료 처리</button></div></article>}<div className="section-heading compact"><div><h2>예약 목록</h2></div></div>{state.loading ? <LoadingState label="예약을 불러오고 있습니다" /> : state.error ? <ErrorState error={state.error} retry={() => void state.reload()} /> : !state.data?.length ? <EmptyState title="예약이 없습니다" description="팬의 예약이 생성되면 이곳에 표시됩니다." /> : <div className="table-wrap"><table><thead><tr><th>예약번호</th><th>행사</th><th>부스</th><th>상품</th><th>상태</th></tr></thead><tbody>{state.data.map((item) => <tr key={item.id}><td className="mono">{item.reservationNo}</td><td>{item.eventName}</td><td>{item.boothName}</td><td>{item.items.length}종</td><td>{item.status}</td></tr>)}</tbody></table></div>}</>
}

export function CreatorPosPage() {
  const {user}=useAuth()
  const booths = useRemote(creatorApi.eventBooths, [])
  const events = useRemote(creatorApi.events, [])
  const sales = useRemote(creatorApi.posSales, [])
  const [params, setParams] = useSearchParams()
  const selectedBooth = params.get('booth') || String(booths.data?.[0]?.id ?? '')
  const products = useRemote(() => selectedBooth ? creatorApi.products(selectedBooth) : Promise.resolve([]), [selectedBooth])
  const [cart, setCart] = useState<Record<number, number>>({})
  const [paymentMethod, setPaymentMethod] = useState('CASH')
  const [message, setMessage] = useState('')
  const [selectedSale, setSelectedSale] = useState<Awaited<ReturnType<typeof creatorApi.posSale>> | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  useEffect(() => { setCart({}); setSelectedSale(null) }, [selectedBooth])
  const items = useMemo(() => (products.data ?? []).filter((product) => (cart[product.id] ?? 0) > 0), [products.data, cart])
  const total = items.reduce((sum, product) => sum + product.price * cart[product.id], 0)
  const trade=useTradeSubmission<{eventBoothId:number;paymentMethod:string;items:ReservationItem[]},Awaited<ReturnType<typeof creatorApi.posSale>>>(
    tradeAttemptKey(user?.id,'POS',selectedBooth),
    body=>creatorApi.createPosSale(body.eventBoothId,body.paymentMethod,body.items,body.requestId),
    creatorApi.posReceipt,creatorApi.posSale,async result=>{
      setCart({});setSelectedSale(result);setMessage(`판매 기록 ${result.saleNo}을 확인했습니다.`)
      await Promise.all([sales.reload(),products.reload()])
    })
  const selling=trade.busy
  const locked=selling||trade.uncertain
  const sell = async () => {
    if (locked || products.loading) return
    setMessage('')
    if (!selectedBooth || !items.length) { setMessage('판매 부스와 상품을 선택해 주세요.'); return }
    if(items.some(item=>!Number.isSafeInteger(cart[item.id])||cart[item.id]<1||item.soldOut||
       (item.stockMode==='FINITE'&&cart[item.id]>(item.stockQuantity??0)))) {setMessage('상품과 수량을 확인해 주세요.');return}
    await trade.submit({eventBoothId:Number(selectedBooth),paymentMethod,items:items.map(item=>({eventProductId:item.id,quantity:cart[item.id]}))})
  }
  const cancel = async (id: number) => { if (!window.confirm('판매 기록을 취소할까요? 재고는 자동 복구되지 않습니다.')) return; try { const canceled = await creatorApi.cancelPosSale(id); if (selectedSale?.id === id) setSelectedSale(canceled); await sales.reload() } catch (caught) { setMessage(caught instanceof Error ? caught.message : '판매를 취소하지 못했습니다.') } }
  const toggleDetail = async (id: number) => {
    if (selectedSale?.id === id) { setSelectedSale(null); return }
    setMessage(''); setDetailLoading(true)
    try { setSelectedSale(await creatorApi.posSale(id)) }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : '판매 상세를 불러오지 못했습니다.') }
    finally { setDetailLoading(false) }
  }
  return <><PageHeader eyebrow="Creator · POS" title="부스 POS" description="현장 판매를 간단히 기록합니다. 실제 결제는 별도로 진행하세요." /><div className="filter-bar"><select className="select" aria-label="판매 부스" disabled={locked} value={selectedBooth} onChange={(event) => setParams({ booth: event.target.value })}>{booths.data?.map((booth) => <option value={booth.id} key={booth.id}>{eventBoothLabel(booth, events.data)}</option>)}</select></div>{message && <div className="notice-banner">{message}</div>}<TradeRecovery state={trade} /><div className="pos-layout"><div><h2>상품 선택</h2>{products.loading ? <LoadingState /> : products.error ? <ErrorState error={products.error} /> : <div className="pos-products">{products.data?.filter((item) => item.isPublic).map((product) => <button className="pos-product" disabled={locked || product.soldOut || (product.stockMode === 'FINITE' && (cart[product.id] ?? 0) >= (product.stockQuantity ?? 0))} key={product.id} onClick={() => setCart((current) => ({ ...current, [product.id]: (current[product.id] ?? 0) + 1 }))}><StatusChip tone={product.soldOut ? 'warning' : 'active'}>{product.soldOut ? '품절' : product.stockMode === 'FINITE' ? `재고 ${product.stockQuantity}` : '판매중'}</StatusChip><strong>{product.name}</strong><span>{formatPrice(product.price)}</span></button>)}</div>}</div><aside className="panel pos-cart"><h2>판매 카트</h2>{items.length ? items.map((item) => <div className="summary-row" key={item.id}><span>{item.name} × {cart[item.id]}</span><button className="btn subtle" disabled={locked} onClick={() => setCart((current) => ({ ...current, [item.id]: Math.max(0, current[item.id] - 1) }))}>−</button></div>) : <p className="empty-copy">판매할 상품을 선택하세요.</p>}<label className="field"><span>결제수단 메모</span><select className="select" disabled={locked} value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="CASH">현금</option><option value="TRANSFER">계좌이체</option><option value="OTHER">기타</option></select></label><div className="summary-total"><span>합계</span><strong>{formatPrice(total)}</strong></div><button className="btn primary wide" disabled={locked || products.loading || !items.length} onClick={() => void sell()}>{selling ? '저장 중…' : '판매 기록'}</button></aside></div><div className="section-heading compact"><h2>최근 판매</h2></div>{sales.loading ? <LoadingState /> : sales.error ? <ErrorState error={sales.error} /> : !sales.data?.length ? <EmptyState title="판매 기록이 없습니다" description="POS에서 저장한 판매가 여기에 표시됩니다." /> : <><div className="table-wrap"><table><thead><tr><th>판매번호</th><th>결제수단</th><th>금액</th><th>상태</th><th>관리</th></tr></thead><tbody>{sales.data.map((sale) => <tr key={sale.id}><td className="mono">{sale.saleNo}</td><td>{paymentMethodLabel(sale.paymentMethod)}</td><td>{formatPrice(sale.totalAmount)}</td><td>{sale.status === 'SOLD' ? '판매' : '취소'}</td><td><div className="row-actions"><button className="btn secondary" disabled={detailLoading} onClick={() => void toggleDetail(sale.id)}>{selectedSale?.id === sale.id ? '상세 닫기' : '상세'}</button><button className="btn danger subtle" disabled={sale.status === 'CANCELED'} onClick={() => void cancel(sale.id)}>취소</button></div></td></tr>)}</tbody></table></div>{selectedSale && <article className="panel pos-sale-detail"><div className="panel-header"><div><p className="eyebrow mono">{selectedSale.saleNo}</p><h2>판매 상세</h2></div><StatusChip tone={selectedSale.status === 'SOLD' ? 'active' : 'muted'}>{selectedSale.status === 'SOLD' ? '판매' : '취소'}</StatusChip></div><dl className="detail-list"><div><dt>판매 시각</dt><dd>{new Date(selectedSale.soldAt).toLocaleString('ko-KR')}</dd></div><div><dt>결제수단</dt><dd>{paymentMethodLabel(selectedSale.paymentMethod)}</dd></div></dl><div className="table-wrap"><table><thead><tr><th>상품</th><th>단가</th><th>수량</th><th>금액</th></tr></thead><tbody>{selectedSale.items.map((item) => <tr key={item.id ?? item.eventProductId}><td>{item.productName ?? item.eventProductId}</td><td>{formatPrice(item.unitPrice ?? 0)}</td><td>{item.quantity}</td><td>{formatPrice((item.unitPrice ?? 0) * item.quantity)}</td></tr>)}</tbody></table></div><div className="summary-total"><span>합계</span><strong>{formatPrice(selectedSale.totalAmount)}</strong></div></article>}</>}</>
}

export function CreatorNoticesPage() {
  const booths = useRemote(creatorApi.eventBooths, [])
  const events = useRemote(creatorApi.events, [])
  const [params, setParams] = useSearchParams()
  const selectedBooth = params.get('booth') || String(booths.data?.[0]?.id ?? '')
  const state = useRemote(() => selectedBooth ? creatorApi.notices(selectedBooth) : Promise.resolve([]), [selectedBooth])
  const [editing, setEditing] = useState<Partial<BoothNotice>>({ title: '', body: '', pinned: false })
  const [message, setMessage] = useState('')
  const save = async (event: FormEvent) => { event.preventDefault(); setMessage(''); try { if (editing.id) await creatorApi.updateNotice(editing.id, editing); else await creatorApi.saveNotice(selectedBooth, editing); setEditing({ title: '', body: '', pinned: false }); await state.reload() } catch (caught) { setMessage(caught instanceof Error ? caught.message : '공지를 저장하지 못했습니다.') } }
  const remove = async (id: number) => { if (!window.confirm('공지를 삭제할까요?')) return; try { await creatorApi.deleteNotice(id); await state.reload() } catch (caught) { setMessage(caught instanceof Error ? caught.message : '공지를 삭제하지 못했습니다.') } }
  return <><PageHeader eyebrow="Creator · Notices" title="공지 관리" description="현장 변경 사항을 작성하고 한 개를 부스 상단에 고정합니다." /><div className="filter-bar"><select className="select" value={selectedBooth} onChange={(event) => setParams({ booth: event.target.value })}>{booths.data?.map((booth) => <option value={booth.id} key={booth.id}>{eventBoothLabel(booth, events.data)}</option>)}</select></div>{message && <div className="form-alert">{message}</div>}<div className="split-layout"><form className="panel form-panel" onSubmit={(event) => void save(event)}><h2>공지 등록/수정</h2><label className="field"><span>제목</span><input className="input" required value={editing.title ?? ''} onChange={(event) => setEditing({ ...editing, title: event.target.value })} /></label><label className="field"><span>내용</span><textarea className="textarea" required rows={6} value={editing.body ?? ''} onChange={(event) => setEditing({ ...editing, body: event.target.value })} /></label><label className="check-field"><input type="checkbox" checked={editing.pinned ?? false} onChange={(event) => setEditing({ ...editing, pinned: event.target.checked })} /> 부스 상단 고정</label><button className="btn primary">공지 저장</button></form><div><h2>공지 목록</h2>{state.loading ? <LoadingState /> : state.error ? <ErrorState error={state.error} /> : !state.data?.length ? <EmptyState title="등록한 공지가 없습니다" description="현장 안내가 생기면 공지를 작성하세요." /> : <div className="console-list">{state.data.map((notice) => <article className="list-row notice-row" key={notice.id}><div>{notice.pinned && <StatusChip tone="warning">상단 고정</StatusChip>}<h3>{notice.title}</h3><p>{notice.body}</p></div><div className="row-actions">{!notice.pinned && <button className="btn secondary" onClick={() => void creatorApi.pinNotice(notice.id).then(state.reload)}>고정</button>}<button className="btn subtle" onClick={() => setEditing(notice)}>수정</button><button className="btn danger subtle" onClick={() => void remove(notice.id)}>삭제</button></div></article>)}</div>}</div></div></>
}
