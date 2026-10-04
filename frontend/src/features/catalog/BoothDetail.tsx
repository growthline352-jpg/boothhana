import { InformationRequestButton } from '../support/InformationRequestButton'
import { OwnershipPanel } from '../support/OwnershipPanels'
import { SaveButton } from '../library/SaveButton'
import { ShareQr } from '../library/ShareQr'
import { dateLabel } from '../discovery/browse'
import { attendance, relevantLocations, visitDays } from '../visit/visit'
import type { EventData } from '../collection/api'
import type { ProductRow, PublicAsset, PublicParticipant } from './api'
import { hasMappableLocation } from './BoothDetail.utils'
import { labels, ProductCard, SafeLink } from './Shared'
import { ContentImage } from '../../components/ui/ContentImage'
import { useMemo, useState, type RefObject } from 'react'

function unique(values: (string | null | undefined)[]) {
  return [...new Set(values.map(value => value?.trim()).filter((value): value is string => Boolean(value)))]
}

function locationLabel(row: PublicParticipant, day: string, hall: string) {
  const locations = relevantLocations(row.participant.locations, day, hall)
  const assigned = locations.find(location => location.code) ?? locations[0]
  return {
    locations,
    code: assigned?.code || labels[assigned?.status || ''] || '위치 미확인',
    hall: assigned?.hall || hall || '전시관 미확인',
    zone: assigned?.zone || '',
  }
}

function detailImages(assets: PublicAsset[]) {
  const order = new Map([['BOOTH_CUT', 0], ['LOGO', 1], ['SALES_SHEET', 2]])
  return [...assets]
    .filter(asset => ['BOOTH_CUT', 'LOGO', 'SALES_SHEET'].includes(asset.type))
    .sort((a, b) => (order.get(a.type) ?? 9) - (order.get(b.type) ?? 9))
    .filter((asset, index, values) => values.findIndex(item => item.url === asset.url) === index)
    .slice(0, 3)
}

function eventProducts(row: PublicParticipant) {
  const rows: ProductRow[] = row.productRows?.length
    ? row.productRows
    : (row.sales?.products ?? []).map(data => ({ id: null, data }))
  return rows.filter(({ data }) => ['EVENT_LISTED', 'EVENT_SALE_CONFIRMED'].includes(data.evidenceScope))
}

type ProductSort = 'default' | 'price-asc' | 'price-desc' | 'name'

function productPriceValue(row: ProductRow) {
  if (!row.data.price) return null
  const value = Number(row.data.price.amount)
  return Number.isFinite(value) ? value : null
}

export function BoothDetail({ eventId, event, row, assets, day, hall, eventNotice, onMap, onVisitChange, onClose, headingRef }: {
  eventId: number
  event: EventData
  row: PublicParticipant
  assets: PublicAsset[]
  day: string
  hall: string
  eventNotice?: string | null
  onMap: () => void
  onVisitChange: (day: string, hall: string) => void
  onClose: () => void
  headingRef?: RefObject<HTMLHeadingElement | null>
}) {
  const place = locationLabel(row, day, hall)
  const days = visitDays(event)
  const halls = unique(relevantLocations(row.participant.locations, day).map(location => location.hall))
  const canOpenMap = hasMappableLocation(row, day, hall)
  const state = attendance(row, day, hall)
  const images = detailImages(assets)
  const members = unique(row.participant.members.map(member => member.name))
  const topics = unique([
    ...row.participant.subjects,
    ...(row.sales?.subjects ?? []),
    ...(row.sales?.categories ?? []),
  ]).slice(0, 6)
  const occurrence = event.occurrences.find(item => item.startDate <= day && item.endDate >= day)
  const officialLinks = unique(row.participant.officialLinks)
  const summary = row.participant.description?.trim() || (row.salesSummaryOrigin==='EDITORIAL'?'':row.sales?.summary) || (topics.length ? `${topics.slice(0, 3).join(' · ')} 관련 부스` : '공개된 부스 소개를 확인하고 있어요.')
  const salesLinks=unique([...(row.sales?.sources??[]).map(source=>source.url),...officialLinks])
  const products = eventProducts(row)
  const unlinkedProductImages = assets.filter(asset => asset.type === 'PRODUCT' && asset.productId === null)
  const [productQuery, setProductQuery] = useState('')
  const [productSort, setProductSort] = useState<ProductSort>('default')
  const visibleProducts = useMemo(() => {
    const query = productQuery.trim().toLocaleLowerCase('ko-KR')
    const filtered = products.filter(entry => !query || entry.data.name.toLocaleLowerCase('ko-KR').includes(query))
    if (productSort === 'default') return filtered
    return filtered.map((entry, index) => ({ entry, index })).sort((a, b) => {
      if (productSort === 'name') return a.entry.data.name.localeCompare(b.entry.data.name, 'ko-KR') || a.index - b.index
      const left = productPriceValue(a.entry), right = productPriceValue(b.entry)
      if (left === null && right !== null) return 1
      if (left !== null && right === null) return -1
      if (left === null || right === null) return a.index - b.index
      return (productSort === 'price-asc' ? left - right : right - left) || a.index - b.index
    }).map(item => item.entry)
  }, [productQuery, productSort, products])

  return <section className="booth-detail" aria-labelledby={`booth-detail-title-${row.id}`}>
    <div className="booth-detail-topline">
      <p><strong>{event.name}</strong>의 참가 부스</p>
      <button className="btn secondary" type="button" onClick={onClose}>부스 목록으로</button>
    </div>
    <div className="booth-visit-controls" aria-label="부스 방문 조건">
      <label className="field"><span>방문일</span><select className="select" value={day} onChange={event => onVisitChange(event.target.value, '')}>{days.map(value => <option key={value} value={value}>{dateLabel(value)}{attendance(row, value) === 'confirmed' ? ' · 참가 확인' : ''}</option>)}{!days.length && <option value="">일정 미확인</option>}</select></label>
      {(halls.length > 0 || hall) && <label className="field"><span>전시관</span><select className="select" value={hall} onChange={event => onVisitChange(day, event.target.value)}><option value="">전체 전시관</option>{unique([...halls, hall]).map(value => <option key={value} value={value}>{value}</option>)}</select></label>}
    </div>
    <div className="booth-detail-hero">
      <div className="booth-detail-intro">
        <div className={`booth-detail-location${canOpenMap ? '' : ' is-unconfirmed'}`}>
          <span>부스 위치</span><strong>{place.code}</strong><small>{place.hall}{place.zone ? ` · ${place.zone}` : ''}</small>
        </div>
        <div className="booth-detail-copy">
          <h1 id={`booth-detail-title-${row.id}`} ref={headingRef} tabIndex={-1}>{row.participant.registrationName}</h1>
          <p className="booth-detail-members">{members.length ? members.join(' · ') : '참가자명 미확인'}</p>
          {topics.length > 0 && <div className="booth-detail-tags">{topics.map(topic => <span key={topic}>{topic}</span>)}</div>}
          <p className="booth-detail-summary">{summary}</p>
          {eventNotice && <p className="visit-important-note">{eventNotice}</p>}
          {(state !== 'confirmed' || !canOpenMap) && <p className="visit-warning" role="status">{state === 'other' ? '선택한 날짜·전시관에는 이 부스의 참가 위치가 등록되어 있지 않아요.' : state === 'unknown' ? '선택한 날짜·전시관의 참가 여부를 아직 확인하지 못했어요.' : '부스번호가 공개되면 배치도에서 위치를 확인할 수 있어요.'}</p>}
          <div className="row-actions booth-detail-actions">
            {canOpenMap && <button type="button" className="btn primary" onClick={onMap}>배치도에서 위치 보기</button>}
            <SaveButton target={{ type: 'PARTICIPANT', eventId, id: row.id, participantId: row.id }} day={day} hall={hall}/>
            <ShareQr target={{ type: 'PARTICIPANT', eventId, id: row.id, participantId: row.id }} day={day} hall={hall} title={row.participant.registrationName}/>
          </div>
        </div>
      </div>
      <div className={`booth-detail-gallery count-${images.length}`}>
        {images.length > 0 ? images.map((asset, index) => <figure key={asset.id} className={index === 0 ? 'is-main' : ''}>
          <SafeLink url={asset.url}><ContentImage url={asset.url} kind="booth" alt={`${asset.caption || `${row.participant.registrationName} 홍보 이미지 ${index + 1}`} · 크게 보기`} loading={index === 0 ? 'eager' : 'lazy'} fetchPriority={index === 0 ? 'high' : 'auto'}/></SafeLink>
          <figcaption>{asset.credit} · <SafeLink url={asset.url}>크게 보기</SafeLink> · <SafeLink url={asset.attribution}>출처</SafeLink></figcaption>
        </figure>) : <figure className="booth-detail-fallback"><ContentImage url={null} kind="booth" alt="" loading="eager"/></figure>}
      </div>
    </div>
    {(row.sales?.salesMethod||salesLinks.length>0||row.salesSummaryOrigin==='EDITORIAL'&&row.sales?.summary)&&<section className="booth-sales-links" aria-label="판매 안내"><h3>판매·선입금 안내</h3>{row.salesSummaryOrigin==='EDITORIAL'&&row.sales?.summary&&<p className="preserve-lines">{row.sales.summary}</p>}{row.sales?.salesMethod&&<p>{row.sales.salesMethod}</p>}{salesLinks.map((url,index)=><SafeLink key={url} url={url}>판매 안내 {index+1} ↗</SafeLink>)}<p>온라인 선입금과 현장 판매 조건은 판매자 안내에서 확인해 주세요.</p></section>}
    <section className="booth-detail-products" aria-labelledby={`booth-products-${row.id}`}>
      <div className="booth-detail-section-heading">
        <div><span>판매 상품</span><h3 id={`booth-products-${row.id}`}>이 부스에서 만날 수 있어요</h3></div>
        <strong>{productQuery.trim() ? `${visibleProducts.length}/${products.length}개` : `${products.length}개 확인`}</strong>
      </div>
      {products.length > 0 && <div className="booth-product-tools">
        <label className="field booth-product-search"><span>상품명 검색</span><input className="input" type="search" value={productQuery} onChange={event => setProductQuery(event.target.value)} placeholder="상품명을 입력하세요"/></label>
        <label className="field booth-product-sort"><span>정렬</span><select className="select" value={productSort} onChange={event => setProductSort(event.target.value as ProductSort)}><option value="default">기본순</option><option value="price-asc">가격 낮은순</option><option value="price-desc">가격 높은순</option><option value="name">이름순</option></select></label>
      </div>}
      {products.length > 0 && visibleProducts.length > 0 ? <div className="catalog-products booth-product-grid">
        {visibleProducts.map((entry, index) => {
          const exactImages = entry.id === null ? [] : assets.filter(asset => asset.type === 'PRODUCT' && asset.productId === entry.id)
          const fallbackImages = products.length === 1 ? unlinkedProductImages.slice(0, 1) : []
          return <ProductCard
            key={entry.id ?? `${entry.data.sourceEntryId ?? entry.data.name}-${index}`}
            product={entry.data}
            images={exactImages.length ? exactImages : fallbackImages}
            verification={entry.verification}
            memoryTarget={entry.id === null ? undefined : { type: 'PRODUCT', eventId, id: entry.id, participantId: row.id }}
            reportTarget={entry.id === null ? undefined : { namespace: 'CATALOG', type: 'PRODUCT', eventId, id: entry.id }}
            day={day}
            hall={hall}
          />
        })}
      </div> : products.length > 0 ? <div className="booth-detail-products-empty">
        <strong>일치하는 상품이 없어요.</strong>
        <p>다른 상품명을 입력하거나 검색어를 지워 주세요.</p>
        <button type="button" className="btn secondary" onClick={() => setProductQuery('')}>검색 초기화</button>
      </div> : <div className="booth-detail-products-empty">
        <strong>공개 확인된 판매 상품이 아직 없어요.</strong>
        <p>판매하지 않는다는 뜻은 아니며, 참가자의 공식 안내에서 최신 품목을 확인해 주세요.</p>
        {officialLinks[0] && <SafeLink url={officialLinks[0]}>공식 판매 안내 확인 ↗</SafeLink>}<InformationRequestButton kind="PRODUCT" eventId={eventId} day={day} query={row.participant.registrationName} label="상품 정보 요청"/>
      </div>}
      <p className="booth-detail-product-note">상품·가격·재고는 수집 당시 공개 안내 기준이며 행사 당일 달라질 수 있어요.</p>
    </section>
    <div className="booth-detail-information">
      <aside className="booth-detail-visit" aria-label="선택한 부스 방문 정보">
        <div><span>방문 정보</span><strong>{day ? dateLabel(day) : '일정 미확인'}</strong></div>
        <dl>
          <div><dt>위치</dt><dd>{place.code}</dd></div>
          <div><dt>행사장</dt><dd>{event.venueName || place.hall}</dd></div>
          <div><dt>행사 운영시간</dt><dd>{occurrence?.startTime || '시간 미확인'}{occurrence?.endTime ? ` ~ ${occurrence.endTime}` : ''}</dd></div>
          <div><dt>입장</dt><dd>{event.admission || '조건 미확인'}</dd></div>
        </dl>
        {canOpenMap && <button type="button" className="btn primary wide" onClick={onMap}>배치도에서 확인</button>}
        <p>공개된 등록 정보 기준이며 행사 당일 위치와 운영 여부가 달라질 수 있어요.</p>
      </aside>
    </div>
    <OwnershipPanel eventId={eventId} participantId={row.id}/>
  </section>
}
