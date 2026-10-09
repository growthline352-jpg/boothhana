import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { creatorApi } from '../../api'
import { useAuth } from '../../app/useAuth'
import { useRemote } from '../../app/useRemote'
import { PageHeader } from '../../components/layout/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States'
import { StatusChip } from '../../components/ui/StatusChip'
import type { BoothSummary, EventSummary, PosSale, ReservationItem } from '../../types'
import { formatPrice } from '../../utils/format'
import { useTradeSubmission } from '../trade/useTradeSubmission'
import { tradeAttemptKey } from '../trade/submission'
import { TradeRecovery } from '../trade/TradeRecovery'
import { CreatorDialog } from './CreatorDialog'
import { eventBoothLabel, saleBoothLabel, salesForBooth } from './context'

const paymentLabel = (value: string) => value === 'CASH' ? '현금' : value === 'TRANSFER' ? '계좌이체' : '기타'

export function CreatorPosPage() {
  const booths = useRemote("features/creator/CreatorPosPage:CreatorPosPage:booths", creatorApi.eventBooths, [])
  const events = useRemote("features/creator/CreatorPosPage:CreatorPosPage:events", creatorApi.events, [])
  const [params, setParams] = useSearchParams()
  const selected = params.get('booth') || String(booths.data?.[0]?.id ?? '')
  if (booths.loading || events.loading) return <LoadingState />
  if (booths.error || events.error) return <ErrorState error={booths.error ?? events.error!} retry={() => void Promise.all([booths.reload(), events.reload()])} />
  if (!booths.data?.length) return <EmptyState title="판매할 행사 부스가 없습니다" description="행사 참가 승인이 완료되면 판매를 기록할 수 있습니다." />
  return <PosWorkspace key={selected} boothId={selected} booths={booths.data} events={events.data ?? []} select={id => setParams({ booth: id })} />
}

function PosWorkspace({ boothId, booths, events, select }: {
  boothId: string; booths: BoothSummary[]; events: EventSummary[]; select: (id: string) => void
}) {
  const { user } = useAuth()
  const booth = booths.find(item => String(item.id) === boothId)
  const ended = events.find(item => item.id === booth?.eventId)?.status === 'ENDED'
  const products = useRemote("features/creator/CreatorPosPage:PosWorkspace:products", () => booth ? creatorApi.products(boothId) : Promise.resolve([]), [boothId])
  const sales = useRemote("features/creator/CreatorPosPage:PosWorkspace:sales", creatorApi.posSales, [])
  const [cart, setCart] = useState<Record<number, number>>({})
  const [paymentMethod, setPaymentMethod] = useState('CASH')
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')
  const [allSales, setAllSales] = useState(false)
  const [selectedSale, setSelectedSale] = useState<PosSale | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<PosSale | null>(null)
  const [cartOpen, setCartOpen] = useState(false)
  const detailRequest = useRef(0)
  const cancelPending = useRef(false)
  useEffect(() => () => { detailRequest.current++ }, [])
  const items = useMemo(() => (products.data ?? []).filter(product => (cart[product.id] ?? 0) > 0), [products.data, cart])
  const total = items.reduce((sum, product) => sum + product.price * cart[product.id], 0)
  const count = items.reduce((sum, product) => sum + cart[product.id], 0)
  const trade = useTradeSubmission<{ eventBoothId: number; paymentMethod: string; items: ReservationItem[] }, PosSale>(
    tradeAttemptKey(user?.id, 'POS', boothId),
    body => creatorApi.createPosSale(body.eventBoothId, body.paymentMethod, body.items, body.requestId),
    creatorApi.posReceipt, creatorApi.posSale, async result => {
      setCart({}); setCartOpen(false); setSelectedSale(result); setMessage(`판매 기록 ${result.saleNo}을 확인했습니다.`)
      await Promise.all([sales.reload(), products.reload()])
    })
  const locked = trade.busy || trade.uncertain || canceling
  const cannotSell = locked || products.loading || !!products.error || !booth || ended || !items.length
  const sell = async () => {
    if (cannotSell) return
    setMessage('')
    if (items.some(item => !Number.isSafeInteger(cart[item.id]) || cart[item.id] < 1 || item.soldOut ||
      (item.stockMode === 'FINITE' && cart[item.id] > (item.stockQuantity ?? 0)))) {
      setMessage('상품과 수량을 확인해 주세요.'); return
    }
    await trade.submit({ eventBoothId: Number(boothId), paymentMethod, items: items.map(item => ({ eventProductId: item.id, quantity: cart[item.id] })) })
  }
  const cancel = async (sale: PosSale) => {
    if (cancelPending.current || locked || sale.status === 'CANCELED') return
    cancelPending.current = true; setCanceling(true); setMessage('')
    try {
      const canceled = await creatorApi.cancelPosSale(sale.id)
      setSelectedSale(current => current?.id === sale.id ? canceled : current)
      await sales.reload(); setCancelTarget(null); setMessage(`${sale.saleNo} 판매 기록을 취소했습니다.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : '판매를 취소하지 못했습니다.') }
    finally { cancelPending.current = false; setCanceling(false) }
  }
  const toggleDetail = async (id: number) => {
    const ticket = ++detailRequest.current
    if (selectedSale?.id === id) { setSelectedSale(null); setDetailLoading(false); return }
    setSelectedSale(null); setMessage(''); setDetailLoading(true)
    try { const detail = await creatorApi.posSale(id); if (ticket === detailRequest.current) setSelectedSale(detail) }
    catch (error) { if (ticket === detailRequest.current) setMessage(error instanceof Error ? error.message : '판매 상세를 불러오지 못했습니다.') }
    finally { if (ticket === detailRequest.current) setDetailLoading(false) }
  }
  const visibleSales = salesForBooth(sales.data ?? [], boothId, allSales)
  const visibleProducts = (products.data ?? []).filter(product => product.isPublic && product.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const cartContents = <>
    <p className="item-meta">{booth && eventBoothLabel(booth, events)}</p>
    {items.length ? items.map(item => <div className="summary-row" key={item.id}><span>{item.name}<small> {formatPrice(item.price)}</small></span>
      <div className="creator-quantity"><button className="btn subtle" aria-label={`${item.name} 수량 줄이기`} disabled={locked} onClick={() => setCart(current => ({ ...current, [item.id]: Math.max(0, current[item.id] - 1) }))}>−</button>
        <strong aria-label={`${item.name} 수량`}>{cart[item.id]}</strong>
        <button className="btn subtle" aria-label={`${item.name} 수량 늘리기`} disabled={locked || item.soldOut || (item.stockMode === 'FINITE' && cart[item.id] >= (item.stockQuantity ?? 0))} onClick={() => setCart(current => ({ ...current, [item.id]: current[item.id] + 1 }))}>+</button></div>
    </div>) : <p className="empty-copy">판매할 상품을 선택하세요.</p>}
    <label className="field"><span>결제수단 메모</span><select className="select" disabled={locked} value={paymentMethod} onChange={event => setPaymentMethod(event.target.value)}><option value="CASH">현금</option><option value="TRANSFER">계좌이체</option><option value="OTHER">기타</option></select></label>
    <div className="summary-total"><span>합계 · {count}개</span><strong>{formatPrice(total)}</strong></div>
    <button className="btn primary wide" disabled={cannotSell} onClick={() => void sell()}>{trade.busy ? '저장 중…' : '판매 기록'}</button>
  </>
  return <div className="creator-pos"><PageHeader eyebrow="Creator · POS" title="부스 POS" description="현장 판매를 간단히 기록합니다. 실제 결제는 별도로 진행하세요." />
    <label className="field"><span>판매 부스</span><select className="select" disabled={locked || detailLoading} value={booth ? boothId : ''} onChange={event => {
      if (items.length && !window.confirm('카트에 상품이 있습니다. 카트를 비우고 다른 부스로 이동할까요?')) return
      select(event.target.value)
    }}>{!booth && <option value="">부스를 선택해 주세요</option>}{booths.map(item => <option value={item.id} key={item.id}>{eventBoothLabel(item, events)}</option>)}</select></label>
    {message && <p className="notice-banner" role="status">{message}</p>}<TradeRecovery state={trade} />
    {ended && <p className="notice-banner">종료된 행사에는 새로운 판매를 기록할 수 없습니다.</p>}
    <div className="pos-layout"><section><h2>상품 선택</h2><label className="field"><span>상품 검색</span><input type="search" className="input" value={query} onChange={event => setQuery(event.target.value)} placeholder="상품명으로 찾기" /></label>
      {products.loading ? <LoadingState /> : products.error ? <ErrorState error={products.error} retry={() => void products.reload()} /> : !visibleProducts.length ? <EmptyState title="표시할 상품이 없습니다" description="상품명과 공개 상태를 확인해 주세요." /> : <div className="pos-products">{visibleProducts.map(product => <button className="pos-product" key={product.id}
        disabled={locked || ended || product.soldOut || (product.stockMode === 'FINITE' && (cart[product.id] ?? 0) >= (product.stockQuantity ?? 0))}
        onClick={() => setCart(current => ({ ...current, [product.id]: (current[product.id] ?? 0) + 1 }))}>
        <StatusChip tone={product.soldOut ? 'warning' : 'active'}>{product.soldOut ? '품절' : product.stockMode === 'FINITE' ? `재고 ${product.stockQuantity}` : '판매중'}</StatusChip><strong>{product.name}</strong><span>{formatPrice(product.price)}</span>
      </button>)}</div>}
    </section><aside className="panel pos-cart creator-desktop-cart"><h2>판매 카트</h2>{cartContents}</aside></div>
    <div className="creator-mobile-sale"><button className="btn secondary" aria-haspopup="dialog" onClick={() => setCartOpen(true)}>카트 {count}개</button><strong aria-live="polite">{formatPrice(total)}</strong>
      <button className="btn primary" aria-haspopup="dialog" aria-label="카트 열고 판매 기록" disabled={cannotSell} onClick={() => setCartOpen(true)}>판매 기록</button></div>
    {cartOpen && <CreatorDialog title="판매 카트" close={() => setCartOpen(false)} busy={trade.busy || canceling} className="creator-cart-dialog"><TradeRecovery state={trade} />{cartContents}</CreatorDialog>}
    {cancelTarget && <CreatorDialog title="판매 기록을 취소할까요?" close={() => setCancelTarget(null)} busy={canceling}>
      <p>{saleBoothLabel(cancelTarget.eventBoothId, booths, events)}</p><p><strong>{cancelTarget.saleNo} · {formatPrice(cancelTarget.totalAmount)}</strong></p>
      <p>재고는 자동 복구되지 않습니다. 반환된 상품의 재고는 별도로 확인해 주세요.</p>
      {message && <p role="status">{message}</p>}
      <div className="row-actions"><button className="btn secondary" disabled={canceling} onClick={() => setCancelTarget(null)}>돌아가기</button><button className="btn danger" disabled={locked} onClick={() => void cancel(cancelTarget)}>{canceling ? '처리 중…' : '이 판매 기록 취소'}</button></div>
    </CreatorDialog>}
    <div className="section-heading compact"><h2>최근 판매</h2><label className="check-field"><input type="checkbox" checked={allSales} disabled={canceling} onChange={event => {
      detailRequest.current++; setSelectedSale(null); setDetailLoading(false); setAllSales(event.target.checked)
    }} /> 모든 행사·부스의 판매 보기</label></div>
    <p className="item-meta">{allSales ? '내 모든 행사·부스의 판매 내역입니다.' : booth ? `${eventBoothLabel(booth, events)}의 판매 내역입니다.` : '부스를 선택해 주세요.'}</p>
    {sales.loading ? <LoadingState /> : sales.error ? <ErrorState error={sales.error} retry={() => void sales.reload()} /> : !visibleSales.length ? <EmptyState title="판매 기록이 없습니다" description="선택한 범위의 판매가 여기에 표시됩니다." /> : <div className="table-wrap"><table><thead><tr><th>판매번호</th><th>행사·부스</th><th>결제수단</th><th>금액</th><th>상태</th><th>관리</th></tr></thead><tbody>{visibleSales.map(sale => <tr key={sale.id}>
      <td className="mono">{sale.saleNo}</td><td>{saleBoothLabel(sale.eventBoothId, booths, events)}</td><td>{paymentLabel(sale.paymentMethod)}</td><td>{formatPrice(sale.totalAmount)}</td><td>{sale.status === 'SOLD' ? '판매' : '취소'}</td>
      <td><div className="row-actions"><button className="btn secondary" disabled={canceling || detailLoading} onClick={() => void toggleDetail(sale.id)}>{selectedSale?.id === sale.id ? '상세 닫기' : '상세'}</button><button className="btn danger subtle" disabled={locked || sale.status === 'CANCELED'} onClick={() => { setMessage(''); setCancelTarget(sale) }}>취소</button></div></td>
    </tr>)}</tbody></table></div>}
    {selectedSale && <article className="panel pos-sale-detail"><div className="panel-header"><div><p className="eyebrow mono">{selectedSale.saleNo}</p><h2>판매 상세</h2><p>{saleBoothLabel(selectedSale.eventBoothId, booths, events)}</p></div><StatusChip tone={selectedSale.status === 'SOLD' ? 'active' : 'muted'}>{selectedSale.status === 'SOLD' ? '판매' : '취소'}</StatusChip></div>
      <dl className="detail-list"><div><dt>판매 시각</dt><dd>{new Date(selectedSale.soldAt).toLocaleString('ko-KR')}</dd></div><div><dt>결제수단</dt><dd>{paymentLabel(selectedSale.paymentMethod)}</dd></div></dl>
      <div className="table-wrap"><table><thead><tr><th>상품</th><th>단가</th><th>수량</th><th>금액</th></tr></thead><tbody>{selectedSale.items.map(item => <tr key={item.id ?? item.eventProductId}><td>{item.productName ?? item.eventProductId}</td><td>{formatPrice(item.unitPrice ?? 0)}</td><td>{item.quantity}</td><td>{formatPrice((item.unitPrice ?? 0) * item.quantity)}</td></tr>)}</tbody></table></div><div className="summary-total"><span>합계</span><strong>{formatPrice(selectedSale.totalAmount)}</strong></div>
    </article>}
  </div>
}
