import {discoveryFeatures} from '../discovery/features'
import {useState} from 'react'
import {Link} from 'react-router'
import {useRemote} from '../../app/useRemote'
import {publicRead} from '../../api/client'
import type {PublicEventSummary} from '../catalog/api'
import {SafeLink} from '../catalog/Shared'
import {BookingBadge} from '../catalog/BookingBadge'
import {downloadVisit} from './calendarExport'
import {compareHref} from '../discovery/compare'
import {eventTimeLabels} from '../discovery/browse'
import '../discovery/explore.css'
export function VisitPreparation({eventId,day}:{eventId:number;day:string}){
 const data=useRemote(()=>publicRead<PublicEventSummary[]>(`/api/public/catalog/events/compare?ids=${eventId}`),[eventId]),[message,setMessage]=useState('')
 const value=data.data?.[0],matching=value?.operatingPlaces?.filter(p=>p.event.occurrences.some(o=>o.startDate<=day&&o.endDate>=day))
 const event=matching?.length===1?matching[0].event:value?.event
 if(data.loading)return <p role="status">방문 정보를 확인하고 있어요.</p>
 if(data.error)return <p role="alert">방문 정보를 확인하지 못했어요. <button className="btn secondary" onClick={()=>void data.reload()}>다시 확인</button></p>
 if(!event)return null
 const official=event.sources.find(s=>s.access==='ORIGINAL'&&['OFFICIAL','ORGANIZER_SOCIAL'].includes(s.kind)),tickets=event.visitorGuide?.tickets.filter(t=>t.sourceUrl&&t.checkedOn&&t.reservationUrl&&(!t.visitDate||t.visitDate===day))??[]
 const ambiguous=!!matching&&matching.length>1
 const valid=!!day&&!ambiguous&&event.occurrences.some(o=>o.startDate<=day&&o.endDate>=day)&&!['CANCELED','POSTPONED'].includes(event.operationStatus?.state||'')
 const exportNow=()=>{try{downloadVisit(event,matching?.length===1?matching[0].eventId:eventId,day);setMessage('캘린더 파일을 내려받았어요. 캘린더 앱에서 알림을 설정해 주세요.')}catch(e){setMessage(e instanceof Error?e.message:'일정을 추가하지 못했어요.')}}
 return <section className="visit-preparation"><h3>방문 준비</h3><p>{day?`${day} 방문 예정`:'아래에서 방문할 날을 선택하세요.'} · {eventTimeLabels(event.occurrences.filter(o=>!day||o.startDate<=day&&day<=o.endDate)).join(' · ')}</p><p>{event.admission||'입장 조건 확인 필요'}</p><BookingBadge event={event} day={day}/>{ambiguous?<p>같은 날짜에 여러 장소가 있습니다. 상세에서 방문할 장소를 먼저 확인해 주세요.</p>:<p>{event.venueName}{event.address&&` · ${event.address}`}</p>}<div className="row-actions">{tickets.map(t=><SafeLink key={t.id} url={t.reservationUrl}>{t.name} 예약 안내 ↗</SafeLink>)}{!tickets.length&&official&&<SafeLink url={official.url}>공식 입장 안내 ↗</SafeLink>}{event.address&&!ambiguous&&<SafeLink url={`https://map.kakao.com/?q=${encodeURIComponent(event.address)}`}>장소 지도 ↗</SafeLink>}<button className="btn secondary" type="button" disabled={!valid} onClick={exportNow}>캘린더 추가</button>{discoveryFeatures.comparison&&<Link to={compareHref([eventId])}>다른 행사와 비교</Link>}</div><small>추가한 캘린더 일정은 변경 사항이 자동 반영되지 않아요.</small>{message&&<p role="status">{message}</p>}</section>
}
