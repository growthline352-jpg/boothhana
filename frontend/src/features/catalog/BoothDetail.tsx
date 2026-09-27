import { SaveButton } from '../library/SaveButton'
import { ShareQr } from '../library/ShareQr'
import { ReportLink, OwnershipLink } from '../support/ReportLink'
import { dateLabel } from '../discovery/browse'
import { attendance, relevantLocations } from '../visit/visit'
import type { EventData } from '../collection/api'
import type { PublicAsset, PublicParticipant } from './api'
import { labels, scopes, SafeLink, StoredImage } from './Shared'
import type { RefObject } from 'react'

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
  const order = new Map([['BOOTH_CUT', 0], ['LOGO', 1], ['SALES_SHEET', 2], ['PRODUCT', 3]])
  return [...assets]
    .filter(asset => ['BOOTH_CUT', 'LOGO', 'SALES_SHEET', 'PRODUCT'].includes(asset.type))
    .sort((a, b) => (order.get(a.type) ?? 9) - (order.get(b.type) ?? 9))
    .filter((asset, index, values) => values.findIndex(item => item.url === asset.url) === index)
    .slice(0, 3)
}

export function BoothDetail({ eventId, event, row, assets, day, hall, viewedVersion, eventNotice, onMap, onClose, headingRef }: {
  eventId: number
  event: EventData
  row: PublicParticipant
  assets: PublicAsset[]
  day: string
  hall: string
  viewedVersion: string
  eventNotice?: string | null
  onMap: () => void
  onClose: () => void
  headingRef?: RefObject<HTMLHeadingElement | null>
}) {
  const place = locationLabel(row, day, hall)
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
  const summary = row.sales?.summary || (topics.length ? `${topics.slice(0, 3).join(' · ')} 관련 부스` : '공개된 부스 소개를 확인하고 있어요.')

  return <section className="booth-detail" aria-labelledby={`booth-detail-title-${row.id}`}>
    <div className="booth-detail-topline">
      <p><strong>{event.name}</strong>의 참가 부스</p>
      <button className="btn secondary" type="button" onClick={onClose}>부스 목록으로</button>
    </div>
    <div className="booth-detail-hero">
      <div className="booth-detail-intro">
        <div className="booth-detail-location">
          <span>부스 위치</span><strong>{place.code}</strong><small>{place.hall}{place.zone ? ` · ${place.zone}` : ''}</small>
        </div>
        <div className="booth-detail-copy">
          <div className="booth-detail-verified"><span aria-hidden="true">●</span> 공개 검토 완료</div>
          <h2 id={`booth-detail-title-${row.id}`} ref={headingRef} tabIndex={-1}>{row.participant.registrationName}</h2>
          <p className="booth-detail-members">{members.length ? members.join(' · ') : '참가자명 미확인'}</p>
          {topics.length > 0 && <div className="booth-detail-tags">{topics.map(topic => <span key={topic}>{topic}</span>)}</div>}
          <p className="booth-detail-summary">{summary}</p>
          {eventNotice && <p className="visit-important-note">{eventNotice}</p>}
          {state !== 'confirmed' && <p className="visit-warning">{state === 'other' ? '선택한 날짜·전시관에는 이 부스의 참가 위치가 등록되어 있지 않아요.' : '선택한 날짜·전시관의 참가 여부를 아직 확인하지 못했어요.'}</p>}
          <div className="row-actions booth-detail-actions">
            <button type="button" className="btn primary" onClick={onMap}>배치도에서 위치 보기</button>
            <SaveButton target={{ type: 'PARTICIPANT', eventId, id: row.id, participantId: row.id }} day={day} hall={hall}/>
            <ShareQr target={{ type: 'PARTICIPANT', eventId, id: row.id, participantId: row.id }} day={day} hall={hall} title={row.participant.registrationName}/>
          </div>
        </div>
      </div>
      <div className={`booth-detail-gallery count-${images.length}`}>
        {images.length > 0 ? images.map((asset, index) => <figure key={asset.id} className={index === 0 ? 'is-main' : ''}>
          <StoredImage url={asset.url} alt={asset.caption || `${row.participant.registrationName} 홍보 이미지 ${index + 1}`} loading={index === 0 ? 'eager' : 'lazy'} fetchPriority={index === 0 ? 'high' : 'auto'}/>
          <figcaption>{asset.credit} · <SafeLink url={asset.attribution}>출처</SafeLink></figcaption>
        </figure>) : <div className="booth-detail-placeholder"><span>{place.code}</span><strong>{row.participant.registrationName}</strong><small>대표 이미지를 준비하고 있어요</small></div>}
      </div>
    </div>
    <div className="booth-detail-information">
      <section className="booth-detail-official" aria-labelledby={`booth-info-${row.id}`}>
        <h3 id={`booth-info-${row.id}`}>부스 정보와 공식 안내</h3>
        <dl>
          <div><dt>참가 작가·업체</dt><dd>{members.join(' · ') || '별도 명칭 미확인'}</dd></div>
          <div><dt>취급 주제</dt><dd>{topics.join(' · ') || '공개된 주제 미확인'}</dd></div>
          <div><dt>정보 범위</dt><dd>{row.sales ? scopes[row.sales.evidenceScope] : '참가 부스 정보만 확인'}</dd></div>
          <div><dt>공식 안내</dt><dd>{officialLinks.length ? officialLinks.map((url, index) => <SafeLink key={url} url={url}>참가자 안내 {index + 1}</SafeLink>) : '링크 미확인'}</dd></div>
        </dl>
        {!!row.sales?.warnings.length && <div className="booth-detail-warnings">{row.sales.warnings.map((warning, index) => <p className="visit-warning" key={index}>{warning}</p>)}</div>}
        <div className="row-actions booth-detail-minor-actions">
          <ReportLink target={{ namespace: 'CATALOG', type: 'PARTICIPANT', eventId, id: row.id, day, hall }} label="부스 정보 신고" viewedVersion={viewedVersion}/>
          <OwnershipLink eventId={eventId} participantId={row.id}/>
        </div>
      </section>
      <aside className="booth-detail-visit" aria-label="선택한 부스 방문 정보">
        <div><span>방문 정보</span><strong>{day ? dateLabel(day) : '일정 미확인'}</strong></div>
        <dl>
          <div><dt>위치</dt><dd>{place.code}</dd></div>
          <div><dt>행사장</dt><dd>{event.venueName || place.hall}</dd></div>
          <div><dt>운영</dt><dd>{occurrence?.startTime || '시간 미확인'}{occurrence?.endTime ? ` ~ ${occurrence.endTime}` : ''}</dd></div>
          <div><dt>입장</dt><dd>{event.admission || '조건 미확인'}</dd></div>
        </dl>
        <button type="button" className="btn primary wide" onClick={onMap}>배치도에서 확인</button>
        <p>공개된 등록 정보 기준이며 행사 당일 위치와 운영 여부가 달라질 수 있어요.</p>
      </aside>
    </div>
  </section>
}
