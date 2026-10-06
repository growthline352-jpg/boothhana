import {ReportLink} from '../support/ReportLink'
import type { EventData, PublicAsset, PublicParticipant } from './api'
import { SafeLink, StoredImage } from './Shared'

export function FloorPlans({ event, assets, participants,eventId }: { eventId?:number; event: EventData; assets: PublicAsset[]; participants: PublicParticipant[] }) {
  const plans = assets.filter(a => a.type === 'FLOOR_PLAN' && a.participantId === null && a.productId === null)
  const links = event.discoveryLinks?.filter(l => l.kind === 'FLOOR_PLAN' && l.url) ?? []
  const linkOnly = links.filter(l => !plans.some(a => a.attribution === l.url || a.url === l.url))
  if (!plans.length && !links.length) return null
  return <section className="panel catalog-floor-plans" aria-labelledby="catalog-floor-plans-title">
    <h2 id="catalog-floor-plans-title">배치도</h2><p>부스번호와 전시관·적용 날짜를 원문에서 확인하세요. 좌표나 현재 위치를 자동 추정하지 않습니다.</p>
    <div className="catalog-floor-plan-grid">{plans.map(plan => {
      // Only associate a hall/date when a published location explicitly points to this map's source.
      const contexts = [...new Set(participants.flatMap(p => p.participant.locations)
        .filter(l => l.floorPlanUrl && (l.floorPlanUrl === plan.attribution || l.floorPlanUrl === plan.url))
        .map(l => [l.hall, l.zone, l.startDate ? `${l.startDate}${l.endDate && l.endDate !== l.startDate ? ` ~ ${l.endDate}` : ''}` : null]
          .filter(Boolean).join(' · ')).filter(Boolean))]
      return <figure key={plan.id}><span className="chip muted">저장된 배치도</span>
        <SafeLink url={plan.url}><StoredImage url={plan.url} alt={plan.caption || `${event.name} 배치도`}/></SafeLink>
        <figcaption><strong>{plan.caption || '행사 배치도'}</strong>
          <p>{contexts.length ? contexts.join(' / ') : '적용 전시관·날짜: 원문 확인 필요'}</p>
          <SafeLink url={plan.url}>배치도 크게 보기 · 새 창</SafeLink>{eventId&&<ReportLink target={{namespace:'CATALOG',type:'ASSET',eventId,id:plan.id}} label="이미지 문제 신고"/>}</figcaption>
      </figure>
    })}</div>
    {linkOnly.map((link, i) => <p className="catalog-map-link" key={i}><span className="chip muted">원문 링크만 확보</span> <SafeLink url={link.url}>배치도 원문 {i + 1}</SafeLink>{link.note && <span> · {link.note}</span>}</p>)}
  </section>
}
