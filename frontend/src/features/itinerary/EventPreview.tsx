import {useEffect,useId,useRef} from 'react'
import {useRemote} from '../../app/useRemote'
import {publicCatalogApi,type PublicEventSummary} from '../catalog/api'
import {eventBooking} from '../catalog/booking'
import {openCatalogDialog} from '../catalog/dialogLifecycle'
import {ContentImage} from '../../components/ui/ContentImage'
import {publicLink} from '../visit/visit'

export function EventPreview({row,day,close,choose}:{row:PublicEventSummary;day:string;close:()=>void;choose:()=>void}){
 const ref=useRef<HTMLDialogElement>(null),title=useRef<HTMLHeadingElement>(null),id=useId()
 const detail=useRemote(()=>publicCatalogApi.event(String(row.id)),[row.id])
 const event=detail.data?.event||row.event,booking=eventBooking(event,day)
 const occurrence=event.occurrences.find(o=>o.startDate<=day&&o.endDate>=day)
 useEffect(()=>openCatalogDialog(ref.current!,title.current,document.activeElement as HTMLElement),[])
 return <dialog ref={ref} className="it-dialog it-event-preview" aria-labelledby={id} onCancel={e=>{e.preventDefault();close()}}>
  <header><h2 ref={title} id={id} tabIndex={-1}>행사 살펴보기</h2><button aria-label="행사 요약 닫기" onClick={close}>×</button></header>
  <div className="it-dialog-body"><ContentImage url={detail.data?.banner?.url||row.banner?.url} kind="event" eventType={event.subcategory} alt=""/><h3>{event.name}</h3>
   <dl><dt>방문 날짜</dt><dd>{day}</dd><dt>장소</dt><dd>{event.venueName||'장소 확인 필요'}{event.address&&<p>{event.address}</p>}</dd><dt>운영 시간</dt><dd>{occurrence?.startTime?`${occurrence.startTime.slice(0,5)}${occurrence.endTime?'–'+occurrence.endTime.slice(0,5):'부터'}`:'확인 필요'}</dd><dt>입장 안내</dt><dd>{event.admission||'확인된 입장 정보가 없어요.'}</dd>{booking&&<><dt>예약 상태</dt><dd>{booking.label}</dd></>}</dl>
   {booking&&['CLOSED','SOLD_OUT'].includes(booking.state)&&<p className="it-check-note">예약 상태와 현장 입장 가능 여부는 다를 수 있어요. 공식 안내에서 현장 입장 조건을 확인하세요.</p>}
   {event.description&&<p className="it-preview-description">{event.description}</p>}
   {detail.loading&&<p role="status">상세 안내를 확인하고 있어요…</p>}{detail.error&&<p role="status">추가 안내를 불러오지 못했어요. 행사 상세에서 다시 확인할 수 있어요.</p>}
   <div className="it-preview-links">{event.sources.filter(s=>s.kind==='OFFICIAL'&&publicLink(s.url)).slice(0,2).map(s=><a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer">공식 안내 ↗</a>)}<a href={`/discover/${row.id}?day=${day}`} target="_blank" rel="noopener noreferrer">전체 상세 보기 ↗</a></div>
  </div><footer className="it-dialog-actions"><button className="btn secondary" onClick={close}>닫기</button><button className="btn primary" onClick={choose}>이 행사로 선택</button></footer>
 </dialog>
}
