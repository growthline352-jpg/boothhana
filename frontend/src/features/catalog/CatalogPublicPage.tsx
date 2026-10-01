import { OwnershipPanel, EventHistory } from '../support/OwnershipPanels'
import { EventComments } from './EventComments'
import { PageMetadata } from '../../app/PageMetadata'
import { SaveButton } from '../library/SaveButton'
import { ShareQr } from '../library/ShareQr'
import { useLibrary } from '../library/LibraryProvider'
import { ReportLink } from '../support/ReportLink'
import { useMemo, useRef, useEffect, useState } from 'react'
import { Link, Navigate, useParams, useLocation, useSearchParams, useNavigate } from 'react-router'
import { DiscoveryPage } from '../discovery/DiscoveryPage'
import { safeReturnTo, safeEventReturnTo, categoryForType, categoryHref } from '../discovery/categories'
import { dateLabel, eventDateLabel, eventTimeLabels, seoulToday } from '../discovery/browse'
import { useRemote } from '../../app/useRemote'
import { LoadingState, ErrorState } from '../../components/ui/States'
import { publicCatalogApi, type PublicEvent, type PublicParticipant } from './api'
import { combineDfesta, isDfestaDay, DFESTA_SATURDAY_ID, DFESTA_SUNDAY_ID, DFESTA_SUNDAY } from './eventGroup'
import { BoothDetail } from './BoothDetail'
import { InteractiveFloorPlans } from '../floorplan/InteractiveFloorPlans'
import { matchesPublicParticipant } from './publicSearch'
import { labels, scopes, SafeLink, LocationText } from './Shared'
import { ContentImage } from '../../components/ui/ContentImage'
import { attendance, relevantLocations, parseVisit, visitParams, resetVisitFilters, visitDays, publicLink, sourceLabel, usableAddress, normalizePlace, catalogBoothPath, catalogEventPath, type VisitQuery } from '../visit/visit'
import { eventStatus } from '../visit/eventStatus'
import { usePageScroll } from '../visit/ScrollMemory'
import '../visit/visit.css'
import './catalog.css'
import './event-detail.css'

export function CatalogPublicPage() { return <DiscoveryPage/> }
export function CatalogPublicDetail() {
  const {eventId=''}=useParams()
  const [params]=useSearchParams()
  const legacyBooth=params.get('booth')
  if(legacyBooth&&/^[1-9]\d*$/.test(legacyBooth))return <Navigate replace to={catalogBoothPath(eventId,legacyBooth,{day:params.get('day')||'',hall:params.get('hall')||''})}/>
  if(eventId===String(DFESTA_SUNDAY_ID)) {
    const next=new URLSearchParams(params)
    if(!next.has('day'))next.set('day',DFESTA_SUNDAY)
    return <Navigate replace to={`/discover/${DFESTA_SATURDAY_ID}?${next}`}/>
  }
  return <LoadEvent key={eventId} eventId={eventId}/>
}
export function CatalogPublicBoothDetail() {
  const {eventId='',participantId=''}=useParams()
  return <LoadBooth key={`${eventId}:${participantId}`} eventId={eventId} participantId={participantId}/>
}
function LoadEvent({eventId}:{eventId:string}) {
  const state=useRemote(async()=>{
    const alternateRequest=eventId===String(DFESTA_SATURDAY_ID)
      ? publicCatalogApi.event(String(DFESTA_SUNDAY_ID)).catch(()=>null)
      : Promise.resolve(null)
    const primary=await publicCatalogApi.event(eventId)
    if(eventId!==String(DFESTA_SATURDAY_ID)||!isDfestaDay(primary.id,primary.event.name))return {primary,alternate:null,display:primary}
    const alternate=await alternateRequest
    if(alternate&&isDfestaDay(alternate.id,alternate.event.name))return {primary,alternate,display:combineDfesta(primary,alternate)}
    return {primary,alternate:null,display:primary}
  },[eventId])
  const [slow,setSlow]=useState(false)
  useEffect(()=>{if(!state.loading){setSlow(false);return}const timer=window.setTimeout(()=>setSlow(true),7_000);return()=>window.clearTimeout(timer)},[state.loading,eventId])
  usePageScroll(!state.loading)
  if(state.loading)return <><PageMetadata /><a className="btn secondary" href={`/library?offline=1&offlineEvent=${eventId}`}>통신이 느린가요? 저장 자료 바로 열기</a><LoadingState label={slow?'서버를 준비하고 있어요. 첫 접속은 최대 1분 정도 걸릴 수 있어요.':'행사 안내를 불러오고 있어요'}/></>
  if(state.error||!state.data)return <section className="content-wrap section-pad"><PageMetadata unavailable /><ErrorState error={state.error||new Error('공개 안내를 찾지 못했습니다.')} retry={()=>void state.reload()}/><Link className="btn secondary" to="/discover">다른 행사 찾기</Link><a className="btn secondary" href={`/library?offline=1&offlineEvent=${eventId}`}>저장 자료 바로 열기</a></section>
  return <><PageMetadata catalog={state.data.display} /><CatalogEventDetail eventId={eventId} value={state.data.display} alternate={state.data.alternate}/></>
}
function LoadBooth({eventId,participantId}:{eventId:string;participantId:string}) {
  const state=useRemote(()=>publicCatalogApi.event(eventId),[eventId])
  const [slow,setSlow]=useState(false)
  useEffect(()=>{if(!state.loading){setSlow(false);return}const timer=window.setTimeout(()=>setSlow(true),7_000);return()=>window.clearTimeout(timer)},[state.loading,eventId])
  usePageScroll(!state.loading)
  if(state.loading)return <><PageMetadata/><LoadingState label={slow?'서버를 준비하고 있어요. 첫 접속은 최대 1분 정도 걸릴 수 있어요.':'부스 정보를 불러오고 있어요'}/></>
  const row=state.data?.participants.find(participant=>String(participant.id)===participantId)
  if(state.error||!state.data||!row)return <section className="content-wrap section-pad"><PageMetadata unavailable/><ErrorState error={state.error||new Error('공개 중인 부스 정보를 찾지 못했습니다.')} retry={()=>void state.reload()}/><Link className="btn secondary" to={catalogEventPath(eventId,{})}>행사 상세로</Link></section>
  return <><PageMetadata catalog={state.data} participant={row}/><CatalogBoothPage eventId={eventId} value={state.data} row={row}/></>
}
function CatalogBoothPage({eventId,value,row}:{eventId:string;value:PublicEvent;row:PublicParticipant}) {
  const location=useLocation(),navigate=useNavigate(),[params]=useSearchParams()
  const state=parseVisit(params,value.event),event=value.event
  const context={day:state.day,hall:state.hall}
  const canonicalEventPath=catalogEventPath(eventId,context)
  const storedReturn=(location.state as {catalogEventReturnTo?:unknown}|null)?.catalogEventReturnTo
  const eventReturn=safeEventReturnTo(storedReturn,eventId,canonicalEventPath)
  const status=eventStatus(event,seoulToday())
  const related=value.participants.filter(participant=>participant.id!==row.id&&attendance(participant,state.day,state.hall)!=='other')
  const relatedPreview=related.slice(0,4)
  const openMap=()=>void navigate(catalogEventPath(eventId,context,'map',row.id))
  return <section className="content-wrap section-pad visit-page">
    <nav className="discovery-back-link" aria-label="현재 위치">
      <Link to="/">홈</Link>{' / '}<Link to={categoryHref(categoryForType(event.subcategory).key)}>행사 목록</Link>{' / '}<Link to={eventReturn}>{event.name}</Link>{' / '}<span aria-current="page">부스 상세</span>
    </nav>
    <BoothDetail eventId={Number(eventId)} event={event} row={row} assets={value.assets.filter(asset=>asset.participantId===row.id)} day={state.day} hall={state.hall} eventNotice={status.notice} onMap={openMap} onClose={()=>void navigate(eventReturn)}/>
    {relatedPreview.length>0&&<section className="booth-related" aria-label="같은 행사 추천 부스">
      <div className="visit-list-heading"><h2>같은 행사에서 더 둘러보기</h2><Link to={eventReturn}>전체 부스 보기</Link></div>
      <div className="booth-related-grid">{relatedPreview.map(participant=><RelatedBoothCard key={participant.id} eventId={Number(eventId)} row={participant} day={state.day} hall={state.hall}/>)}</div>
    </section>}
  </section>
}
function RelatedBoothCard({eventId,row,day,hall}:{eventId:number;row:PublicParticipant;day:string;hall:string}) {
  const locations=relevantLocations(row.participant.locations,day,hall)
  return <Link className="booth-related-card" to={catalogBoothPath(eventId,row.id,{day,hall})}>
    <LocationText locations={locations}/><strong>{row.participant.registrationName}</strong>
    <small>{row.participant.subjects.slice(0,2).join(' · ')||'참가 정보 보기'}</small>
  </Link>
}
export function CatalogEventDetail({eventId,value,alternate=null}:{eventId:string;value:PublicEvent;alternate?:PublicEvent|null}) {
  const location=useLocation(),navigate=useNavigate(),[params,setParams]=useSearchParams()
  const state=parseVisit(params,value.event),library=useLibrary()
  const currentValue=alternate&&state.day===DFESTA_SUNDAY?alternate:value
  const currentEventId=currentValue.id
  const e=alternate?{...currentValue.event,name:value.event.name,occurrences:value.event.occurrences}:value.event
  const section=params.get('section')==='reviews'||params.get('view')==='reviews'?'reviews':params.get('section')==='booths'||(!params.has('section')&&params.get('view')==='booths')?'booths':'home'
  const memoryMode=params.get('my')==='saved'?'saved':params.get('my')==='visited'?'visited':'all'
  const savedParticipants=useMemo(()=>new Set((library?.index||[]).filter(x=>x.target.eventId===currentEventId&&x.target.participantId!==null).map(x=>x.target.participantId!)),[library?.index,currentEventId])
  const visitedParticipants=useMemo(()=>new Set((library?.index||[]).filter(x=>x.target.eventId===currentEventId&&x.target.participantId!==null&&x.visitedDays.includes(state.day)).map(x=>x.target.participantId!)),[library?.index,currentEventId,state.day])
  const memoryFilter=memoryMode==='saved'?savedParticipants:visitedParticipants
  const memoryReady=!!library&&(library.owner==='guest'||library.owner.startsWith('member:'))&&!library.loading&&!library.error
  const memoryBlocked=memoryMode!=='all'&&!memoryReady
  const memoryError=library?.owner==='error'||!!library?.error
  const [today,setToday]=useState(()=>seoulToday())
  useEffect(()=>{const id=window.setInterval(()=>setToday(seoulToday()),60_000);return()=>clearInterval(id)},[])
  const status=eventStatus(e,today),days=visitDays(e)
  const storedReturn=(location.state as {catalogReturnTo?:unknown}|null)?.catalogReturnTo
  const back=storedReturn?safeReturnTo(storedReturn):categoryHref(categoryForType(e.subcategory).key)
  const mapHeading=useRef<HTMLDivElement>(null),mapActionPending=useRef(false)
  const [message,setMessage]=useState('')
  const halls=useMemo(()=>[...new Set(currentValue.participants.flatMap(p=>p.participant.locations)
    .filter(l=>!l.startDate||!l.endDate||(l.startDate<=state.day&&l.endDate>=state.day)).map(l=>l.hall).filter((h):h is string=>!!h))].sort(),[currentValue.participants,state.day])
  const list=useMemo(()=>currentValue.participants.filter(p=>attendance(p,state.day,state.hall)!=='other')
    .filter(p=>matchesPublicParticipant({...p,participant:{...p.participant,locations:relevantLocations(p.participant.locations,state.day,state.hall)}},state.q)).filter(p=>memoryMode==='all'||memoryFilter.has(p.id)),[currentValue.participants,state.day,state.hall,state.q,memoryMode,memoryFilter])
  const banner=currentValue.banner===undefined?currentValue.assets.find(a=>a.type==='BANNER'&&a.participantId===null):currentValue.banner
  const update=(patch:Partial<VisitQuery>)=>{
    const next={...state,...patch}
    const qs=visitParams(next);if(memoryMode!=='all')qs.set('my',memoryMode)
    const nextSection=patch.tab==='map'||patch.tab==='info'?'home':patch.tab==='booths'?'booths':section
    if(nextSection!=='home')qs.set('section',nextSection)
    setParams(qs,{replace:true,preventScrollReset:true})
  }
  const chooseSection=(next:'home'|'booths'|'reviews')=>{
    const qs=visitParams({...state,tab:next==='booths'?'booths':'map',focus:null})
    if(memoryMode!=='all')qs.set('my',memoryMode)
    if(next!=='home')qs.set('section',next)
    setParams(qs,{replace:true,preventScrollReset:true})
  }
  const resetFilters=()=>{
    const next=resetVisitFilters(params,e)
    if(section!=='home')next.set('section',section)
    setParams(next,{replace:true,preventScrollReset:true})
    setMessage('방문일은 유지하고 검색·전시관·내 관심 조건을 모두 해제했어요.')
  }
  const open=(id:number)=>void navigate(catalogBoothPath(currentEventId,id,{day:state.day,hall:state.hall}),{state:{catalogEventReturnTo:location.pathname+location.search}})
  const showMap=(id:number)=>{
    mapActionPending.current=true;setMessage('');update({tab:'map',focus:id,booth:null,q:''})
  }
  useEffect(()=>{
    if(!mapActionPending.current||section!=='home')return
    mapActionPending.current=false
    const frame=requestAnimationFrame(()=>{mapHeading.current?.scrollIntoView({block:'start',behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});mapHeading.current?.focus({preventScroll:true})})
    return()=>cancelAnimationFrame(frame)
  },[section,state.focus,state.booth])
  const visitChange=(day:string)=>{update({day,hall:'',focus:null,booth:null});setMessage('방문일 기준으로 참가 부스와 위치를 바꿨어요.')}
  const official=e.sources.find(s=>['OFFICIAL','ORGANIZER_SOCIAL'].includes(s.kind)&&s.access==='ORIGINAL'&&publicLink(s.url))
  const copyAddress=async()=>{try{await navigator.clipboard.writeText(e.address!);setMessage('주소를 복사했어요.')}catch{setMessage(`공개 주소: ${e.address} — 길게 눌러 복사해 주세요.`)}}
  return <section className="content-wrap section-pad visit-page event-detail-redesign">
    <Link className="discovery-back-link" to={back} state={{catalogRestore:true}}>← {categoryForType(e.subcategory).label} 목록</Link>
    <header className="visit-summary"><figure className="visit-poster"><ContentImage url={banner?.url} kind="event" eventType={e.subcategory} alt={`${e.name} 대표 이미지`}/>{banner&&<figcaption>{banner.credit} · <SafeLink url={banner.attribution}>이미지 출처</SafeLink><ReportLink target={{namespace:'CATALOG',type:'ASSET',eventId:currentEventId,id:banner.id}} label="이미지 문제 신고"/></figcaption>}</figure><div className="visit-summary-copy"><div className="visit-summary-kicker"><p className="eyebrow">{labels[e.subcategory]} · 행사 안내</p><span className={`chip visit-status is-${status.state}`}>{status.label}</span></div><h1>{e.name}</h1>
      {status.notice&&<p className="visit-important-note" role="status">{status.notice} {status.operation.sourceUrl&&<SafeLink url={status.operation.sourceUrl}>상태 안내 원문</SafeLink>}{status.operation.checkedOn&&<small> · {status.operation.checkedOn} 확인</small>}</p>}
      <dl className="visit-facts"><div><dt>행사일</dt><dd>{eventDateLabel(e.occurrences)}</dd></div>
        <div><dt>행사 시간</dt><dd>{eventTimeLabels(e.occurrences).map(label=><div key={label}>{label}</div>)}</dd></div>
        <div><dt>장소</dt><dd>{e.venueName||'장소 미공개·미확인'}{e.address&&<small>{e.address}</small>}</dd></div>
        <div><dt>입장</dt><dd>{e.admission||'입장 조건 미확인 · 무료 여부는 주최 공지를 확인하세요.'}</dd></div></dl>
      <div className="visit-primary-actions"><button type="button" className="btn primary" onClick={()=>chooseSection('booths')}>이날 부스 {currentValue.participants.length}곳 보기</button>{official&&<SafeLink url={official.url}>공식 관람 안내 ↗</SafeLink>}</div>
      <div className="visit-utility-actions">{usableAddress(e.address)&&<><SafeLink url={`https://map.kakao.com/?q=${encodeURIComponent(e.address!)}`}>장소 지도 ↗</SafeLink><button type="button" onClick={()=>void copyAddress()}>주소 복사</button></>}
        <SaveButton target={{type:'EVENT',eventId:Number(eventId),id:Number(eventId),participantId:null}} day={state.day} hall={state.hall}/><ShareQr target={{type:'EVENT',eventId:Number(eventId),id:Number(eventId),participantId:null}} day={state.day} hall={state.hall} title={e.name}/><ReportLink target={{namespace:'CATALOG',type:'EVENT',eventId:currentEventId,id:currentEventId,day:state.day,hall:state.hall}} viewedVersion={currentValue.publishedAt}/></div><p className="item-meta">로그인 없이 둘러볼 수 있어요. 예매·구매는 공식 안내를 확인하세요.</p>
    </div></header>
    <nav className="visit-main-tabs" aria-label="행사 상세 메뉴">{([['home','홈'],['booths','부스'],['reviews','후기 (댓글)']] as const).map(([key,label])=><button key={key} type="button" aria-current={section===key?'page':undefined} className={section===key?'is-current':''} onClick={()=>chooseSection(key)}>{label}</button>)}</nav>
    <section id="visit-browse" hidden={section==='reviews'} className="visit-controls" aria-label="방문 조건 및 부스 검색"><div className="visit-controls-head"><div><p className="eyebrow">{section==='home'?'배치도':'참가 부스'}</p><h2>{section==='home'?'날짜별 배치도':'부스 찾기'}</h2></div></div>
    <div className="visit-condition-row">
      <label className="field"><span>방문일</span><select className="select" value={state.day} onChange={ev=>visitChange(ev.target.value)}>{days.map(d=><option key={d} value={d}>{dateLabel(d)}{d===today?' · 오늘':''}</option>)}{!days.length&&<option value="">일정 미확인</option>}</select></label>
      <label className="field"><span>전시관</span><select className="select" value={state.hall} onChange={ev=>{update({hall:ev.target.value,focus:null,booth:null});setMessage('선택한 전시관 기준으로 안내해요.')}}><option value="">전체 전시관</option>{halls.map(h=><option key={h} value={h}>{h}</option>)}{state.hall&&!halls.some(h=>normalizePlace(h)===normalizePlace(state.hall))&&<option value={state.hall}>{state.hall} · 등록 위치 미확인</option>}</select></label>
      <label className="field visit-search"><span>{section==='home'?'배치도에서 부스 찾기':'부스·번호·작가·상품 찾기'}</span><input className="input" type="search" value={state.q} maxLength={100} placeholder="B1, 작가명, 달토끼 키링" onChange={ev=>update({q:ev.target.value,focus:null})}/></label>
    </div><p role="status" className="visit-feedback">{message}</p>
    {params.get('day')&&params.get('day')!==state.day&&<p className="visit-important-note">링크의 날짜는 현재 공개된 운영일이 아니어서 가장 가까운 운영일을 표시합니다.</p>}</section>
    {section!=='reviews'&&<><div className="memory-mode-switch" role="group" aria-label="내 관심 기준"><span>이 행사에서</span>{([['all','전체 부스'],['saved','저장한 부스'],['visited','방문 표시한 부스']] as const).map(([key,label])=><button type="button" key={key} className="btn secondary" aria-pressed={memoryMode===key} disabled={key!=='all'&&!memoryReady} onClick={()=>{const n=new URLSearchParams(params);if(key==='all')n.delete('my');else n.set('my',key);setParams(n,{replace:true,preventScrollReset:true})}}>{label}</button>)}<Link to={`/library?event=${eventId}`}>이 행사 보관함 →</Link></div>
    {(state.q||state.hall||memoryMode!=='all')&&<div className="visit-active-filters"><span>현재 조건 · {[state.q?`검색: ${state.q}`:'',state.hall,memoryMode==='saved'?'저장한 부스':memoryMode==='visited'?'방문 표시한 부스':''].filter(Boolean).join(' / ')}</span><button type="button" onClick={resetFilters}>조건 해제</button></div>}
    {memoryMode!=='all'&&<p className="item-meta">{memoryMode==='saved'?'상품을 저장한 업체도 함께 보여요. 배치도는 저장한 부스를 강조하며 다른 부스 위치를 바꾸지 않아요.':'선택한 방문일에 직접 표시한 기록만 보여요. QR 스캔은 방문 기록이 아닙니다.'}</p>}</>}
    {memoryBlocked&&section!=='reviews'&&<div className="visit-memory-state" role={memoryError?'alert':'status'}>
      <h2>{memoryError?'내 관심 목록을 확인하지 못했어요':'내 관심 목록을 확인하고 있어요'}</h2>
      <p>기록을 확인하기 전에는 부스가 없다고 판단하지 않습니다. 공개된 전체 부스는 바로 볼 수 있어요.</p>
      <div className="row-actions"><button className="btn primary" type="button" onClick={resetFilters}>전체 부스 보기</button><Link className="btn secondary" to={`/library?event=${eventId}`}>보관함에서 확인</Link></div>
    </div>}
    <section hidden={section!=='booths'||memoryBlocked} aria-label="참가 부스 목록">
      <div className="visit-list-heading"><h2>소개된 부스 <strong>{list.length}</strong>곳</h2><small>선택한 날짜에 공개된 {currentValue.participants.length}곳 중 현재 조건 · 전체 참가 명단은 아닙니다.</small></div>
      <div className="catalog-booth-grid">{list.map(p=><ParticipantCard key={p.id} eventId={currentEventId} row={p} day={state.day} hall={state.hall} assets={currentValue.assets} showMap={showMap}/>)}</div>
      {!list.length&&<div className="visit-empty"><h3>현재 소개된 부스 중에는 결과가 없어요.</h3><p>미수집·위치 미확인은 실제 미참가를 뜻하지 않아요.</p><div className="row-actions"><button className="btn secondary" onClick={resetFilters}>모든 부스 조건 해제</button><button className="btn secondary" onClick={()=>chooseSection('home')}>행사 안내 확인</button></div></div>}
    </section>
    <div hidden={section!=='home'||memoryBlocked} ref={mapHeading} tabIndex={-1} className="visit-map-section"><InteractiveFloorPlans eventId={String(currentEventId)} event={currentValue.event} assets={currentValue.assets} participants={currentValue.participants} day={state.day} hall={state.hall} query={state.q} focusParticipantId={state.focus} onOpen={open} onList={()=>chooseSection('booths')} onClear={()=>update({q:'',focus:null})} onlySaved={memoryMode!=='all'} savedParticipantIds={memoryReady?[...memoryFilter]:[]}/></div>
    <section hidden={section!=='home'} className="panel visit-info" aria-label="행사 안내"><h2>행사 안내</h2>{e.operationStatus?.sourceUrl&&<details><summary>개최 상태의 확인 근거</summary><p>{e.operationStatus.note}</p><SafeLink url={e.operationStatus.sourceUrl}>상태 공지 원문</SafeLink><small> · {e.operationStatus.checkedOn} 확인</small></details>}<p className="visit-long-copy">{e.description}</p><h3>전체 운영일</h3>{e.occurrences.map((o,i)=><p key={i}>{o.startDate}{o.startDate!==o.endDate?` – ${o.endDate}`:''} · {o.startTime||'시간 미확인'}{o.endTime?` – ${o.endTime}`:''}</p>)}
      {!!e.warnings.length&&<><h3>방문 전 확인사항</h3>{e.warnings.map((w,i)=><p key={i}>{w}</p>)}</>}
      <h3>공식·참고 안내</h3>{e.sources.map((s,i)=><p key={i}><SafeLink url={s.url}>{sourceLabel(s.kind,s.url)}</SafeLink>{s.access!=='ORIGINAL'&&<small> · 원문 직접 확인 필요</small>}</p>)}
      {e.discoveryLinks?.filter(l=>l.url).map((l,i)=><p key={`l${i}`}><SafeLink url={l.url}>{({PARTICIPANTS:'공식 참가 명단',FLOOR_PLAN:'공식 배치도 게시물',SALES:'공식 판매 안내',OFFICIAL:'행사 공식 안내'} as Record<string,string>)[l.kind]||'행사 관련 안내'}</SafeLink>{l.note&&` · ${l.note}`}</p>)}
      <small>공개본 갱신: {new Date(currentValue.publishedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}. 수집 후 변경될 수 있으므로 방문 전 주최 측 최신 공지를 확인하세요.</small>
    </section>
    <div hidden={section!=='home'}><OwnershipPanel eventId={Number(eventId)}/><Link className="btn secondary" to="/library">내 보관함에서 오프라인 정보 저장</Link><EventHistory key={`history-${eventId}`} eventId={Number(eventId)}/></div>
    <div hidden={section!=='reviews'}><EventComments key={eventId} eventId={Number(eventId)}/></div>
  </section>
}
function ParticipantCard({eventId,row,day,hall,assets,showMap}:{eventId:number;row:PublicParticipant;day:string;hall:string;assets:PublicEvent['assets'];showMap?:(id:number)=>void}) {
  const thumb=assets.find(a=>a.participantId===row.id&&['BOOTH_CUT','PRODUCT','LOGO'].includes(a.type))
  const locations=relevantLocations(row.participant.locations,day,hall),known=attendance(row,day,hall)
  return <article className="panel catalog-booth-card visit-booth-card has-image">
    <figure><ContentImage url={thumb?.url} kind="booth" alt={thumb?.caption||row.participant.registrationName}/>{thumb&&<figcaption>{thumb.credit} · <SafeLink url={thumb.attribution}>출처</SafeLink></figcaption>}</figure>
    <div className="visit-booth-body"><LocationText locations={locations}/><h3>{row.participant.registrationName}</h3><p className="visit-booth-summary">{row.sales?.summary||'판매정보를 확인하고 있어요.'}</p>
      {known==='unknown'&&<small className="visit-warning">선택 날짜·전시관 참가 여부 미확인</small>}
      {row.sales&&<small>{scopes[row.sales.evidenceScope]}</small>}<p className="item-meta">{row.participant.subjects.join(' · ')}</p>
      <div className="row-actions"><SaveButton target={{type:'PARTICIPANT',eventId,id:row.id,participantId:row.id}} day={day} hall={hall} compact/>{showMap?<button className="btn secondary" onClick={()=>showMap(row.id)}>지도에서 보기</button>:<Link className="btn secondary" to={catalogEventPath(eventId,{day,hall},'map',row.id)}>지도에서 보기</Link>}<Link className="btn primary" to={catalogBoothPath(eventId,row.id,{day,hall})}>부스 상세</Link></div>
    </div></article>
}
