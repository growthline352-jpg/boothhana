import { Link } from 'react-router'
import type { BoothSummary, EventProduct, EventSummary } from '../../types'
import { StatusChip } from '../../components/ui/StatusChip'
import { formatDate, formatPrice } from '../../utils/format'
import { ContentImage } from '../../components/ui/ContentImage'

export function EventCard({ event }: { event: EventSummary; index?: number }) {
  const status = event.status === 'ENDED' ? '종료' : event.status === 'PUBLISHED' ? '진행중' : '준비중'
  return <Link className="event-card" to={`/events/${event.id}`}>
    <div className="event-card-image"><ContentImage url={event.imageUrl} kind="event" alt={event.name}/></div>
    <div className="event-card-body"><StatusChip tone={event.status === 'ENDED' ? 'muted' : 'active'}>{status}</StatusChip><h3>{event.name}</h3><p className="item-meta">{formatDate(event.startAt)} — {formatDate(event.endAt)}</p><p className="item-meta">{event.venue} · 참가 부스 {event.boothCount ?? 0}개</p></div>
  </Link>
}

export function BoothCard({ booth }: { booth: BoothSummary; index?: number }) {
  return <Link className="booth-card" to={`/booths/${booth.id}`}>
    <div className="thumb"><ContentImage url={booth.imageUrl} kind="booth" alt={booth.name}/></div>
    <div className="booth-card-copy"><h3>{booth.name}</h3><p className="item-meta">{booth.boothNumber} · {booth.creatorName}</p><p>{booth.intro}</p><div className="status-row"><StatusChip tone="active">예약 가능 {booth.reservableCount ?? 0}개</StatusChip><StatusChip>상품 {booth.productCount ?? 0}개</StatusChip></div></div>
  </Link>
}

export function ProductCard({ product }: { product: EventProduct; index?: number }) {
  return <Link className={`product-card ${product.soldOut ? 'is-soldout' : ''}`} to={`/products/${product.id}`}>
    <div className="image"><ContentImage url={product.imageUrl} kind="product" alt={product.name}/></div>
    <div className="product-card-body"><div className="status-row">{product.soldOut ? <StatusChip tone="warning">SOLD OUT</StatusChip> : product.reservationEnabled ? <StatusChip tone="active">예약 가능</StatusChip> : <StatusChip>현장 판매</StatusChip>}</div><h3>{product.name}</h3><p className="item-meta">{product.description}</p><p className="price">{formatPrice(product.price)}</p>{product.stockMode === 'FINITE' && <p className="stock-text">{product.stockQuantity ?? 0}개 남음</p>}</div>
  </Link>
}
