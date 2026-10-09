import {ReportLink} from '../features/support/ReportLink'
import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useRemote } from '../app/useRemote'
import { publicApi } from '../api'
import { ErrorState, EmptyState, LoadingState } from '../components/ui/States'
import { StatusChip } from '../components/ui/StatusChip'
import { PageHeader } from '../components/layout/PageHeader'
import { ContentImage } from '../components/ui/ContentImage'
import { BoothCard, EventCard, ProductCard } from '../features/cards/DomainCards'
import { formatDate, formatPrice } from '../utils/format'

export function EventsPage() {
  const state = useRemote("pages/PublicPages:EventsPage:state", publicApi.events, [])
  const [params] = useSearchParams()
  const [query, setQuery] = useState(params.get('q') ?? '')
  const [status, setStatus] = useState('ALL')
  const filtered = useMemo(() => (state.data ?? []).filter((event) => {
    const matchesQuery = `${event.name} ${event.venue}`.toLowerCase().includes(query.trim().toLowerCase())
    const matchesStatus = status === 'ALL' || status === event.status
    return matchesQuery && matchesStatus
  }), [query, state.data, status])
  return <section className="content-wrap section-pad"><PageHeader eyebrow="Public · Events" title="행사 탐색" description="진행 중이거나 곧 열리는 행사에서 부스와 굿즈를 확인하세요." /><div className="filter-bar"><input className="input" type="search" placeholder="행사명, 장소 검색" aria-label="행사 검색" value={query} onChange={(event) => setQuery(event.target.value)} /><select className="select" aria-label="행사 상태" value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">전체 행사</option><option value="PUBLISHED">진행중</option><option value="ENDED">종료</option></select></div>{state.loading ? <LoadingState label="행사를 불러오고 있습니다" /> : state.error ? <ErrorState error={state.error} retry={() => void state.reload()} /> : !state.data?.length ? <EmptyState title="공개된 행사가 없습니다" description="새 행사가 공개되면 이곳에서 확인할 수 있습니다." /> : !filtered.length ? <EmptyState title="검색 결과가 없습니다" description="검색어나 행사 상태를 바꿔 보세요." /> : <div className="event-grid">{filtered.map((event, index) => <EventCard event={event} index={index} key={event.id} />)}</div>}</section>
}

export function EventDetailPage() {
  const { eventId = '' } = useParams()
  const event = useRemote("pages/PublicPages:EventDetailPage:event", () => publicApi.event(eventId), [eventId])
  const booths = useRemote("pages/PublicPages:EventDetailPage:booths", () => publicApi.eventBooths(eventId), [eventId])
  if (event.loading) return <LoadingState label="행사 정보를 불러오고 있습니다" />
  if (event.error || !event.data) return <ErrorState error={event.error ?? new Error('행사를 찾을 수 없습니다.')} retry={() => void event.reload()} />
  return <section className="content-wrap section-pad"><header className="event-hero"><div><p className="eyebrow">Event Detail</p><h1>{event.data.name}</h1><ReportLink target={{namespace:'PLATFORM',type:'EVENT',eventId:Number(eventId),id:Number(eventId)}}/><p className="lead">{event.data.description}</p><div className="detail-inline"><span>{formatDate(event.data.startAt)} — {formatDate(event.data.endAt)}</span><span>{event.data.venue}</span><StatusChip tone={event.data.status === 'ENDED' ? 'muted' : 'active'}>{event.data.status === 'ENDED' ? '종료' : '진행중'}</StatusChip></div></div><div className="event-poster"><ContentImage url={event.data.imageUrl} kind="event" alt={event.data.name} /></div></header>{event.data.status === 'ENDED' && <div className="notice-banner"><strong>종료된 행사입니다.</strong><span>부스와 상품은 계속 볼 수 있지만 새로운 예약은 받지 않습니다.</span></div>}<div className="section-heading compact"><div><p className="eyebrow">Booths</p><h2>참가 부스 찾기</h2></div></div><div className="filter-bar"><input className="input" type="search" placeholder="부스명, 크리에이터명 검색" aria-label="참가 부스 검색" /></div>{booths.loading ? <LoadingState label="참가 부스를 불러오고 있습니다" /> : booths.error ? <ErrorState error={booths.error} retry={() => void booths.reload()} /> : !booths.data?.length ? <EmptyState title="공개된 참가 부스가 없습니다" description="승인된 부스가 공개되면 이곳에 표시됩니다." /> : <div className="booth-list">{booths.data.map((booth, index) => <BoothCard booth={booth} index={index} key={booth.id} />)}</div>}</section>
}

export function BoothDetailPage() {
  const { boothId = '' } = useParams()
  const booth = useRemote("pages/PublicPages:BoothDetailPage:booth", () => publicApi.booth(boothId), [boothId])
  const products = useRemote("pages/PublicPages:BoothDetailPage:products", () => publicApi.products(boothId), [boothId])
  if (booth.loading) return <LoadingState label="부스 정보를 불러오고 있습니다" />
  if (booth.error || !booth.data) return <ErrorState error={booth.error ?? new Error('부스를 찾을 수 없습니다.')} retry={() => void booth.reload()} />
  const pinned = booth.data.notices?.find((notice) => notice.pinned)
  return <section className="content-wrap section-pad"><header className="booth-hero"><div className="booth-visual"><ContentImage url={booth.data.imageUrl} kind="booth" alt={booth.data.name} /></div><div><p className="eyebrow">Booth · {booth.data.boothNumber}</p><h1>{booth.data.name}</h1><ReportLink target={{namespace:'PLATFORM',type:'BOOTH',eventId:booth.data.eventId??0,id:Number(boothId)}} label="부스 정보 신고"/><p className="lead">{booth.data.intro}</p><div className="detail-inline"><span>{booth.data.creatorName}</span><StatusChip tone="active">공개중</StatusChip></div></div></header>{pinned && <aside className="pinned-notice"><span className="chip warning">상단 고정</span><div><strong>{pinned.title}</strong><p>{pinned.body}</p></div></aside>}<div className="detail-columns"><article className="panel"><h2>부스 소개</h2><p>{booth.data.intro}</p></article><article className="panel"><h2>부스 정보</h2><dl className="detail-list"><div><dt>부스 번호</dt><dd>{booth.data.boothNumber}</dd></div><div><dt>크리에이터</dt><dd>{booth.data.creatorName}</dd></div></dl></article></div><div className="section-heading compact"><div><p className="eyebrow">Goods</p><h2>부스 전체 굿즈</h2></div>{products.data?.some((item) => item.reservationEnabled && !item.soldOut) && <Link className="btn primary" to={`/booths/${boothId}/reserve`}>굿즈 예약</Link>}</div>{products.loading ? <LoadingState label="굿즈를 불러오고 있습니다" /> : products.error ? <ErrorState error={products.error} retry={() => void products.reload()} /> : !products.data?.length ? <EmptyState title="등록된 굿즈가 없습니다" description="상품이 공개되면 이곳에 표시됩니다." /> : <div className="product-grid">{products.data.map((product, index) => <ProductCard product={product} index={index} key={product.id} />)}</div>}</section>
}

export function ProductDetailPage() {
  const { productId = '' } = useParams()
  const product = useRemote("pages/PublicPages:ProductDetailPage:product", () => publicApi.product(productId), [productId])
  if (product.loading) return <LoadingState label="상품 정보를 불러오고 있습니다" />
  if (product.error || !product.data) return <ErrorState error={product.error ?? new Error('상품을 찾을 수 없습니다.')} retry={() => void product.reload()} />
  const item = product.data
  return <section className="content-wrap section-pad"><PageHeader eyebrow="Goods · Product" title="상품 상세" /><div className="product-detail"><div className="product-image"><ContentImage url={item.imageUrl} kind="product" alt={item.name} /></div><div className="product-summary"><div className="status-row">{item.soldOut ? <StatusChip tone="warning">SOLD OUT</StatusChip> : item.reservationEnabled ? <StatusChip tone="active">예약 가능</StatusChip> : <StatusChip>현장 판매</StatusChip>}</div><h2>{item.name}</h2><ReportLink target={{namespace:'PLATFORM',type:'PRODUCT',eventId:0,id:item.id}} label="상품 정보 신고"/><p className="product-price">{formatPrice(item.price)}</p>{item.stockMode === 'FINITE' && <p className="stock-text">현재 {item.stockQuantity ?? 0}개 남음</p>}<p>{item.description}</p><Link className={`btn primary wide ${item.soldOut || !item.reservationEnabled ? 'disabled' : ''}`} aria-disabled={item.soldOut || !item.reservationEnabled} to={`/booths/${item.eventBoothId}/reserve`}>{item.soldOut ? '품절된 상품' : item.reservationEnabled ? '현장 수령 예약' : '현장 판매 상품'}</Link></div></div><div className="detail-columns"><article className="panel"><h2>상품 안내</h2><p>{item.description}</p></article><article className="panel"><h2>예약/수령 확인 항목</h2><ul className="plain-list"><li>예약 후 발급된 번호와 QR을 확인하세요.</li><li>결제는 행사 현장에서 진행합니다.</li><li>부스 공지를 방문 전에 확인하세요.</li></ul></article></div></section>
}
