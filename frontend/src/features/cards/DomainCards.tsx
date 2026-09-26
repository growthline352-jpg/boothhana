import { Link } from 'react-router'
import type { BoothSummary, EventProduct, EventSummary } from '../../types'
import { StatusChip } from '../../components/ui/StatusChip'
import { formatDate, formatPrice } from '../../utils/format'

const fallbackImages = ['/assets/boothup/moon-rabbit-keychains.png', '/assets/boothup/pixel-cat-stickers.png', '/assets/boothup/star-courier-posters.png', '/assets/boothup/summer-cat-pouch.png']

export function EventCard({ event, index = 0 }: { event: EventSummary; index?: number }) {
  const status = event.status === 'ENDED' ? '종료' : event.status === 'PUBLISHED' ? '진행중' : '준비중'
  return <Link className="event-card" to={`/events/${event.id}`}>
    <div className="event-card-image"><img src={event.imageUrl || fallbackImages[index % fallbackImages.length]} alt="" /></div>
    <div className="event-card-body"><StatusChip tone={event.status === 'ENDED' ? 'muted' : 'active'}>{status}</StatusChip><h3>{event.name}</h3><p className="item-meta">{formatDate(event.startAt)} — {formatDate(event.endAt)}</p><p className="item-meta">{event.venue} · 참가 부스 {event.boothCount ?? 0}개</p></div>
  </Link>
}

export function BoothCard({ booth, index = 0 }: { booth: BoothSummary; index?: number }) {
  return <Link className="booth-card" to={`/booths/${booth.id}`}>
    <div className="thumb"><img src={booth.imageUrl || fallbackImages[index % fallbackImages.length]} alt="" /></div>
    <div className="booth-card-copy"><h3>{booth.name}</h3><p className="item-meta">{booth.boothNumber} · {booth.creatorName}</p><p>{booth.intro}</p><div className="status-row"><StatusChip tone="active">예약 가능 {booth.reservableCount ?? 0}개</StatusChip><StatusChip>상품 {booth.productCount ?? 0}개</StatusChip></div></div>
  </Link>
}

export function ProductCard({ product, index = 0 }: { product: EventProduct; index?: number }) {
  return <Link className={`product-card ${product.soldOut ? 'is-soldout' : ''}`} to={`/products/${product.id}`}>
    <div className="image"><img src={product.imageUrl || fallbackImages[index % fallbackImages.length]} alt={product.name} /></div>
    <div className="product-card-body"><div className="status-row">{product.soldOut ? <StatusChip tone="warning">SOLD OUT</StatusChip> : product.reservationEnabled ? <StatusChip tone="active">예약 가능</StatusChip> : <StatusChip>현장 판매</StatusChip>}</div><h3>{product.name}</h3><p className="item-meta">{product.description}</p><p className="price">{formatPrice(product.price)}</p>{product.stockMode === 'FINITE' && <p className="stock-text">{product.stockQuantity ?? 0}개 남음</p>}</div>
  </Link>
}
