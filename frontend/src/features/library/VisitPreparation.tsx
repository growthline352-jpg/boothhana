import {useEffect,useState} from 'react'
import {useRemote} from '../../app/useRemote'
import {publicRead} from '../../api/client'
import type {PublicEventSummary} from '../catalog/api'
import {SafeLink} from '../catalog/Shared'
import {BookingBadge} from '../catalog/BookingBadge'
import {downloadVisit} from './calendarExport'
import {eventTimeLabels} from '../discovery/browse'
import {DiscoveryIcon} from '../discovery/DiscoveryIcon'
import './visitPreparation.css'
export function VisitPreparation({eventId,day}:{eventId:number;day:string}){
 const data=useRemote(()=>publicRead<PublicEventSummary[]>(`/api/public/catalog/events/compare?ids=${eventId}`),[eventId]),[message,setMessage]=useState('')
 useEffect(()=>setMessage(''),[eventId,day])
 const value=data.data?.[0],matching=value?.operatingPlaces?.filter(p=>p.event.occurrences.some(o=>o.startDate<=day&&o.endDate>=day))
 const event=matching?.length===1?matching[0].event:value?.event
 if(data.loading)return <div className="visit-prep-feedback" role="status">방문 정보를 확인하고 있어요.</div>
 if(data.error)return <div className="visit-prep-feedback" role="alert">방문 정보를 확인하지 못했어요. <button type="button" className="btn secondary" onClick={()=>void data.reload()}>다시 확인</button></div>
 if(!event)return null
 const official=event.sources.find(s=>s.access==='ORIGINAL'&&['OFFICIAL','ORGANIZER_SOCIAL'].includes(s.kind)),tickets=event.visitorGuide?.tickets.filter(t=>t.sourceUrl&&t.checkedOn&&t.reservationUrl&&(!t.visitDate||t.visitDate===day))??[]
 const ambiguous=!!matching&&matching.length>1
 const valid=!!day&&!ambiguous&&event.occurrences.some(o=>o.startDate<=day&&o.endDate>=day)&&!['CANCELED','POSTPONED'].includes(event.operationStatus?.state||'')
 const exportNow=()=>{try{downloadVisit(event,matching?.length===1?matching[0].eventId:eventId,day);setMessage('캘린더 파일을 내려받았어요. 캘린더 앱에서 알림을 설정해 주세요.')}catch(e){setMessage(e instanceof Error?e.message:'일정을 추가하지 못했어요.')}}
 const times=eventTimeLabels(event.occurrences.filter(o=>!day||o.startDate<=day&&day<=o.endDate)).join(' · ')
 const inactive=['CANCELED','POSTPONED'].includes(event.operationStatus?.state||'')
 return <div className="visit-prep-information">
  <dl className="visit-prep-facts">
   <div><dt>운영 시간</dt><dd className="visit-prep-time">{times||'시간 안내 확인 필요'}</dd></div>
   <div><dt>장소</dt><dd>{ambiguous?<p>같은 날에 여러 장소가 있어요. 행사 상세에서 방문할 곳을 확인해 주세요.</p>:<><strong>{event.venueName||'장소 안내 확인 필요'}</strong>{event.address&&<span className="visit-prep-address">{event.address}</span>}</>}</dd></div>
   <div><dt>입장·예매</dt><dd><BookingBadge event={event} day={day}/><p>{event.admission||'입장 조건 확인 필요'}</p><div className="visit-prep-official">{tickets.map(t=><SafeLink key={t.id} url={t.reservationUrl}>{t.name} 예약 안내 <DiscoveryIcon name="arrow" size={16}/></SafeLink>)}{!tickets.length&&official&&<SafeLink url={official.url}>공식 입장 안내 <DiscoveryIcon name="arrow" size={16}/></SafeLink>}</div></dd></div>
  </dl>
  <div className="visit-prep-tools">
   {event.address&&!ambiguous&&<SafeLink url={`https://map.kakao.com/?q=${encodeURIComponent(event.address)}`}><DiscoveryIcon name="pin" size={18}/>장소 지도</SafeLink>}
   <button className="btn secondary" type="button" disabled={!valid} onClick={exportNow}><DiscoveryIcon name="calendar" size={18}/>캘린더 추가</button>
  </div>
  <p className="visit-prep-calendar-note">{!day?'방문할 날을 고르면 캘린더에 추가할 수 있어요.':inactive?'취소·연기 안내를 공식 페이지에서 확인해 주세요.':!valid&&!ambiguous?'현재 행사 일정에 맞는 방문일을 골라 주세요.':'추가한 캘린더 일정은 자동 갱신되지 않아요.'}</p>
  {message&&<p className="visit-prep-message" role="status">{message}</p>}
 </div>
}
