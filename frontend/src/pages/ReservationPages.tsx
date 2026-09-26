import { useTradeSubmission } from '../features/trade/useTradeSubmission'
import { tradeAttemptKey } from '../features/trade/submission'
import { TradeRecovery } from '../features/trade/TradeRecovery'
import type { ReservationItem } from '../types'
import { supportPath } from '../features/support/rules'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import QRCode from 'qrcode'
import { publicApi, reservationApi } from '../api'
import { useRemote } from '../app/useRemote'
import { useAuth } from '../app/useAuth'
import { ErrorState, EmptyState, FieldError, LoadingState } from '../components/ui/States'
import { PageHeader } from '../components/layout/PageHeader'
import { StatusChip } from '../components/ui/StatusChip'
import { formatPrice } from '../utils/format'
import type { Reservation } from '../types'

export function ReservationCreatePage() {
  const { boothId = '' } = useParams()
  const { user, loading: authLoading, loginUrl } = useAuth()
  const navigate = useNavigate()
  const booth = useRemote(() => publicApi.booth(boothId), [boothId])
  const products = useRemote(() => publicApi.products(boothId), [boothId])
  const [quantities, setQuantities] = useState<Record<number, number>>({})
  const trade=useTradeSubmission<{eventBoothId:number;items:ReservationItem[]},Reservation>(
    tradeAttemptKey(user?.id,'RESERVATION',boothId),
    body=>reservationApi.create(body.eventBoothId,body.items,body.requestId),
    reservationApi.receipt,id=>reservationApi.detail(String(id)),
    result=>{void navigate(`/reservations/${result.id}`)})
  const submitting=trade.busy
  const locked=submitting||trade.uncertain
  useEffect(() => { setQuantities({}) }, [boothId])
  const [formError, setFormError] = useState('')
  const selected = useMemo(() => (products.data ?? []).filter((item) => (quantities[item.id] ?? 0) > 0), [products.data, quantities])
  const total = selected.reduce((sum, item) => sum + item.price * quantities[item.id], 0)

  if (authLoading || booth.loading || products.loading) return <LoadingState label="예약 화면을 준비하고 있습니다" />
  if (booth.error || products.error || !booth.data) return <section className="content-wrap section-pad"><TradeRecovery state={trade}/><ErrorState error={booth.error ?? products.error ?? new Error('부스를 찾을 수 없습니다.')} /><Link className="btn secondary" to="/reservations">내 예약 확인</Link></section>
  if (!user) return <section className="content-wrap section-pad"><EmptyState title="로그인이 필요합니다" description="카카오 팬 계정으로 로그인하면 굿즈를 예약할 수 있습니다." action={<a className="btn primary" href={loginUrl}>카카오 로그인</a>} /></section>

  const submit = async () => {
    if (locked) return
    setFormError('')
    if (!selected.length) { setFormError('예약할 상품과 수량을 선택해 주세요.'); return }
    if (selected.some(item => !item.reservationEnabled || item.soldOut || !Number.isSafeInteger(quantities[item.id]) || quantities[item.id] < 1 || (item.stockMode === 'FINITE' && quantities[item.id] > (item.stockQuantity ?? 0)))) {
      setFormError('상품의 예약 가능 여부와 수량을 확인해 주세요.'); return
    }
    await trade.submit({eventBoothId:Number(boothId),items:selected.map(item=>({eventProductId:item.id,quantity:quantities[item.id]}))})
  }

  return <section className="content-wrap section-pad"><PageHeader eyebrow="Reservation · On-site Pickup" title="현장 수령 예약 요청" description="온라인 결제 없이 상품과 수량만 예약합니다. 결제는 현장에서 진행하세요." /><TradeRecovery state={trade} /><div className="reservation-layout"><div className="panel"><h2>예약 정보</h2>{formError && <div className="form-alert">{formError}</div>}<div className="reservation-products">{(products.data ?? []).filter((item) => item.reservationEnabled && !item.soldOut).map((item) => <label className="reservation-item" key={item.id}><img src={item.imageUrl || '/assets/boothup/moon-rabbit-keychains.png'} alt="" /><span><strong>{item.name}</strong><small>{formatPrice(item.price)}{item.stockMode === 'FINITE' ? ` · ${item.stockQuantity ?? 0}개 남음` : ''}</small></span><input className="input quantity-input" type="number" disabled={locked} min="0" max={item.stockMode === 'FINITE' ? item.stockQuantity ?? 0 : 99} value={quantities[item.id] ?? 0} onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: Number(event.target.value) }))} aria-label={`${item.name} 수량`} /></label>)}</div><FieldError>{!products.data?.some((item) => item.reservationEnabled && !item.soldOut) ? '현재 예약 가능한 상품이 없습니다.' : ''}</FieldError></div><aside className="panel order-summary"><h2>요청 상품</h2><p className="item-meta">{booth.data.name} · {booth.data.boothNumber}</p>{selected.length ? selected.map((item) => <div className="summary-row" key={item.id}><span>{item.name} × {quantities[item.id]}</span><strong>{formatPrice(item.price * quantities[item.id])}</strong></div>) : <p className="empty-copy">수량을 선택하면 여기에 표시됩니다.</p>}<div className="summary-total"><span>현장 결제 예정</span><strong>{formatPrice(total)}</strong></div><button className="btn primary wide" disabled={locked} onClick={() => void submit()}>{submitting ? '예약 중…' : '예약 요청하기'}</button></aside></div></section>
}

export function ReservationsPage() {
  const { user, loading: authLoading, loginUrl } = useAuth()
  const state = useRemote(() => user ? reservationApi.list() : Promise.resolve([]), [user?.id])
  return <section className="content-wrap section-pad"><PageHeader eyebrow="My · Reservations" title="내 예약" description="예약한 굿즈와 현장 수령 상태를 확인합니다." />{authLoading ? <LoadingState label="계정을 확인하고 있습니다" /> : !user ? <EmptyState title="로그인이 필요합니다" description="카카오 계정으로 로그인하면 예약 내역을 확인할 수 있습니다." action={<a className="btn primary" href={loginUrl}>카카오 로그인</a>} /> : state.loading ? <LoadingState label="예약을 불러오고 있습니다" /> : state.error ? <ErrorState error={state.error} retry={() => void state.reload()} /> : !state.data?.length ? <EmptyState title="예약한 굿즈가 없습니다" description="행사와 부스를 둘러보고 원하는 굿즈를 예약해 보세요." action={<Link className="btn primary" to="/events">행사 둘러보기</Link>} /> : <div className="reservation-list">{state.data.map((item) => <Link className="reservation-card" to={`/reservations/${item.id}`} key={item.id}><div><p className="eyebrow mono">{item.reservationNo}</p><h2>{item.boothName}</h2><p className="item-meta">{item.eventName} · 상품 {item.items.length}종</p></div><StatusChip tone={item.status === 'CANCELED' ? 'muted' : item.status === 'PICKED_UP' ? 'info' : 'active'}>{statusText(item.status)}</StatusChip></Link>)}</div>}</section>
}

export function ReservationDetailPage() {
  const { reservationId = '' } = useParams()
  const state = useRemote(() => reservationApi.detail(reservationId), [reservationId])
  const [qr, setQr] = useState('')
  const [actionError, setActionError] = useState('')
  useEffect(() => {
    let active = true
    setQr('')
    if (state.data?.qrToken) QRCode.toDataURL(state.data.qrToken, { width: 240, margin: 2 })
      .then(value => { if (active) setQr(value) }).catch(() => { if (active) setQr('') })
    return () => { active = false }
  }, [state.data?.qrToken])
  if (state.loading) return <LoadingState label="예약 상세를 불러오고 있습니다" />
  if (state.error || !state.data) return <ErrorState error={state.error ?? new Error('예약을 찾을 수 없습니다.')} retry={() => void state.reload()} />
  const item = state.data
  const cancel = async () => {
    if (!window.confirm('이 예약을 취소할까요?')) return
    setActionError('')
    try { await reservationApi.cancel(item.id); await state.reload() } catch (error) { setActionError(error instanceof Error ? error.message : '예약을 취소하지 못했습니다.') }
  }
  return <section className="content-wrap section-pad"><PageHeader eyebrow="My · Reservation" title="예약 상세" actions={<StatusChip tone={item.status === 'CANCELED' ? 'muted' : 'active'}>{statusText(item.status)}</StatusChip>} /><div className="ticket"><div className="ticket-main"><p className="eyebrow">Reservation Number</p><h2 className="reservation-no mono" style={{ overflowWrap: 'anywhere' }}>{item.reservationNo}</h2><dl className="detail-list"><div><dt>행사</dt><dd>{item.eventName}</dd></div><div><dt>부스</dt><dd>{item.boothName}</dd></div><div><dt>상태</dt><dd>{statusText(item.status)}</dd></div></dl><Link className="support-report-link" to={supportPath('INQUIRY',{namespace:'PLATFORM',type:'RESERVATION',eventId:0,id:item.id})}>이 예약 고객문의</Link><h3>예약 상품</h3>{item.items.map((line) => <div className="summary-row" key={line.id ?? line.eventProductId}><span>{line.productName ?? `상품 #${line.eventProductId}`} × {line.quantity}</span><strong>{line.unitPrice ? formatPrice(line.unitPrice * line.quantity) : ''}</strong></div>)}{actionError && <div className="form-alert">{actionError}</div>}{item.status === 'RESERVED' && <button className="btn danger" onClick={() => void cancel()}>예약 취소</button>}</div><aside className="qr-panel">{qr ? <img src={qr} alt={`${item.reservationNo} QR`} /> : <div className="qr-placeholder">QR</div>}<p>현장에서 예약번호 또는 QR을 보여주세요.</p></aside></div></section>
}

function statusText(status: Reservation['status']) {
  return status === 'RESERVED' ? '예약' : status === 'PICKED_UP' ? '수령 완료' : '취소'
}
