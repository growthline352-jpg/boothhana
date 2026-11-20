import { SubcultureBackLink } from '../subculture/SubcultureBackLink'
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
import { safeReturnTo, categoryForType, categoryHref } from '../discovery/categories'
import { dateLabel, eventDateLabel, eventTimeLabels, seoulToday } from '../discovery/browse'
import { useRemote } from '../../app/useRemote'
import { LoadingState, ErrorState } from '../../components/ui/States'
import { publicCatalogApi, type PublicEvent, type PublicParticipant } from './api'
import { combineDfesta, DFESTA_MAIN_ID, DFESTA_SUNDAY, DFESTA_SUNDAY_ID, isDfestaEdition } from './dfesta'
import { BoothDetail } from './BoothDetail'
import { EventFollowup } from './EventFollowup'
import { InteractiveFloorPlans } from '../floorplan/InteractiveFloorPlans'
import { matchesPublicParticipant } from './publicSearch'
import { labels, scopes, SafeLink, LocationText } from './Shared'
import { ContentImage } from '../../components/ui/ContentImage'
import { attendance, relevantLocations, parseVisit, visitParams, resetVisitFilters, visitDays, publicLink, sourceLabel, usableAddress, normalizePlace, catalogBoothPath, catalogEventPath, type VisitQuery } from '../visit/visit'
import { eventStatus } from '../visit/eventStatus'
import { usePageScroll } from '../visit/ScrollMemory'
import '../visit/visit.css'
import './catalog.css'

export function CatalogPublicPage() { return <DiscoveryPage/> }
export function CatalogPublicDetail() {
  const {eventId=''}=useParams()
  const location=useLocation()
  const [params]=useSearchParams()
  const legacyBooth=params.get('booth')
  if(legacyBooth&&/^[1-9]\d*$/.test(legacyBooth)){
    const target=new URL(catalogBoothPath(eventId,legacyBooth,{day:params.get('day')||'',hall:params.get('hall')||''}),'https://local.invalid')
    const product=params.get('product');if(product&&/^[1-9]\d*$/.test(product))target.searchParams.set('product',product)
    return <Navigate replace to={target.pathname+target.search} state={location.state}/>
  }
  if(eventId===String(DFESTA_SUNDAY_ID)){
    const next=new URLSearchParams(params)
    if(!next.has('day'))next.set('day',DFESTA_SUNDAY)
    if(location.hash==='#event-comments'||location.hash==='#event-comments-sunday')next.set('view','reviews')
    return <Navigate replace to={`/discover/${DFESTA_MAIN_ID}?${next.toString()}${location.hash==='#event-comments-sunday'?'#event-comments':location.hash}`}/>
  }
  return <LoadEvent key={eventId} eventId={eventId}/>
}
export function CatalogPublicBoothDetail() {
  const {eventId='',participantId=''}=useParams()
  return <LoadBooth key={`${eventId}:${participantId}`} eventId={eventId} participantId={participantId}/>
}
function LoadEvent({eventId}:{eventId:string}) {
  const state=useRemote(async()=>{
    const primary=await publicCatalogApi.event(eventId)
    if(Number(eventId)!==DFESTA_MAIN_ID||!isDfestaEdition(primary.id,primary.event.name))return {value:primary,second:null,secondUnavailable:false}
    try { const second=await publicCatalogApi.event(String(DFESTA_SUNDAY_ID));
      if(!isDfestaEdition(second.id,second.event.name))return {value:primary,second:null,secondUnavailable:true}
      return {value:combineDfesta(primary,second),second,secondUnavailable:false} }
    catch { return {value:primary,second:null,secondUnavailable:true} }
  },[eventId])
  const [slow,setSlow]=useState(false)
  useEffect(()=>{if(!state.loading){setSlow(false);return}const timer=window.setTimeout(()=>setSlow(true),7_000);return()=>window.clearTimeout(timer)},[state.loading,eventId])
  usePageScroll(!state.loading)
  if(state.loading)return <><PageMetadata /><a className="btn secondary" href={`/library?offline=1&offlineEvent=${eventId}`}>통신이 느린가요? 저장 자료 바로 열기</a><LoadingState label={slow?'서버를 준비하고 있어요. 첫 접속은 최대 1분 정도 걸릴 수 있어요.':'행사 안내를 불러오고 있어요'}/></>
  if(state.error||!state.data)return <section className="content-wrap section-pad"><PageMetadata unavailable /><ErrorState error={state.error||new Error('공개 안내를 찾지 못했습니다.')} retry={()=>void state.reload()}/><Link className="btn secondary" to="/discover">다른 행사 찾기</Link><a className="btn secondary" href={`/library?offline=1&offlineEvent=${eventId}`}>저장 자료 바로 열기</a></section>
  return <><PageMetadata catalog={state.data.value} /><CatalogEventDetail eventId={eventId} value={state.data.value} second={state.data.second} secondUnavailable={state.data.secondUnavailable} onRetry={()=>void state.reload()}/></>
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
  const canonicalEventPath=catalogEventPath(eventId===String(DFESTA_SUNDAY_ID)&&isDfestaEdition(value.id,event.name)?DFESTA_MAIN_ID:eventId,context,'booths')
  const storedReturn=(location.state as {catalogEventReturnTo?:unknown}|null)?.catalogEventReturnTo
  const eventReturn=typeof storedReturn==='string'&&['/discover/'+eventId, '/discover/'+DFESTA_MAIN_ID].includes(storedReturn.split('?')[0])?safeReturnTo(storedReturn):canonicalEventPath
  const status=eventStatus(event,seoulToday())
  const related=value.participants.filter(participant=>participant.id!==row.id&&attendance(participant,state.day,state.hall)!=='other')
  const relatedPreview=related.slice(0,4)
  const requestedProduct=params.get('product')
  useEffect(()=>{
    if(!requestedProduct||!/^\d+$/.test(requestedProduct))return
    const frame=requestAnimationFrame(()=>{
      const product=document.querySelector<HTMLElement>(`[data-product-id="${requestedProduct}"]`)
      product?.scrollIntoView({block:'center'});product?.focus({preventScroll:true})
    })
    return()=>cancelAnimationFrame(frame)
  },[requestedProduct,row.id])
  const openMap=()=>void navigate(catalogEventPath(eventId,context,'map',row.id))
  return <section className="content-wrap section-pad visit-page"><SubcultureBackLink/>
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
export function CatalogEventDetail({eventId,value,second=null,secondUnavailable=false,onRetry}:{eventId:string;value:PublicEvent;second?:PublicEvent|null;secondUnavailable?:boolean;onRetry?:()=>void}) {
  const location=useLocation(),navigate=useNavigate(),[params,setParams]=useSearchParams()
  const state=parseVisit(params,value.event),e=value.event,library=useLibrary()
  useEffect(()=>{
    if(location.hash!=='#event-comments'&&location.hash!=='#event-comments-sunday')return
    if(state.tab!=='reviews'){
      const next=new URLSearchParams(params);next.set('view','reviews');setParams(next,{replace:true,preventScrollReset:true});return
    }
    const frame=requestAnimationFrame(()=>document.getElementById('event-comments')?.scrollIntoView({block:'start'}))
    return()=>cancelAnimationFrame(frame)
  },[location.hash,state.tab,params,setParams])
  const sundayIds=useMemo(()=>new Set(second?.participants.map(p=>p.id)||[]),[second])
  const sourceEventId=(participantId:number)=>sundayIds.has(participantId)?DFESTA_SUNDAY_ID:Number(eventId)
  const dayParticipants=useMemo(()=>second?value.participants.filter(p=>sundayIds.has(p.id)===(state.day===DFESTA_SUNDAY)):value.participants,[second,value.participants,sundayIds,state.day])
  const mapEventId=second&&state.day===DFESTA_SUNDAY?String(DFESTA_SUNDAY_ID):eventId
  const homeTab=['home','map','info'].includes(state.tab)
  const memoryMode=params.get('my')==='saved'?'saved':params.get('my')==='visited'?'visited':'all'
  const savedParticipants=useMemo(()=>new Set((library?.index||[]).filter(x=>(x.target.eventId===Number(eventId)||second&&x.target.eventId===DFESTA_SUNDAY_ID)&&x.target.participantId!==null).map(x=>x.target.participantId!)),[library?.index,eventId,second])
  const visitedParticipants=useMemo(()=>new Set((library?.index||[]).filter(x=>(x.target.eventId===Number(eventId)||second&&x.target.eventId===DFESTA_SUNDAY_ID)&&x.target.participantId!==null&&x.visitedDays.includes(state.day)).map(x=>x.target.participantId!)),[library?.index,eventId,state.day,second])
  const memoryFilter=memoryMode==='saved'?savedParticipants:visitedParticipants
  const memoryReady=!!library&&(library.owner==='guest'||library.owner.startsWith('member:'))&&!library.loading&&!library.error
  const memoryBlocked=memoryMode!=='all'&&!memoryReady
  const memoryError=library?.owner==='error'||!!library?.error
  const [today,setToday]=useState(()=>seoulToday())
  useEffect(()=>{const id=window.setInterval(()=>setToday(seoulToday()),60_000);return()=>clearInterval(id)},[])
  const status=eventStatus(e,today),days=visitDays(e)
  const daySpecificBooths=days.length>1&&(!!second||value.participants.some(p=>p.participant.locations.some(l=>!!l.startDate&&!!l.endDate&&(l.startDate>days[0]||l.endDate<days[days.length-1]))))
  const storedReturn=(location.state as {catalogReturnTo?:unknown}|null)?.catalogReturnTo
  const back=storedReturn?safeReturnTo(storedReturn):categoryHref(categoryForType(e.subcategory).key)
  const mapHeading=useRef<HTMLDivElement>(null),mapActionPending=useRef(false)
  const [message,setMessage]=useState('')
  const halls=useMemo(()=>[...new Set(dayParticipants.flatMap(p=>p.participant.locations)
    .filter(l=>!l.startDate||!l.endDate||(l.startDate<=state.day&&l.endDate>=state.day)).map(l=>l.hall).filter((h):h is string=>!!h))].sort(),[dayParticipants,state.day])
  const list=useMemo(()=>dayParticipants.filter(p=>attendance(p,state.day,state.hall)!=='other')
    .filter(p=>matchesPublicParticipant({...p,participant:{...p.participant,locations:relevantLocations(p.participant.locations,state.day,state.hall)}},state.q)).filter(p=>memoryMode==='all'||memoryFilter.has(p.id)),[dayParticipants,state.day,state.hall,state.q,memoryMode,memoryFilter])
  const banner=value.banner===undefined?value.assets.find(a=>a.type==='BANNER'&&a.participantId===null):value.banner
  const update=(patch:Partial<VisitQuery>)=>{
    const next={...state,...patch}
    const qs=visitParams(next);if(memoryMode!=='all')qs.set('my',memoryMode);setParams(qs,{replace:true,preventScrollReset:true})
  }
  const resetFilters=()=>{
    setParams(resetVisitFilters(params,e),{replace:true,preventScrollReset:true})
    setMessage('방문일은 유지하고 검색·전시관·내 관심 조건을 모두 해제했어요.')
  }
  const open=(id:number)=>void navigate(catalogBoothPath(sourceEventId(id),id,{day:state.day,hall:state.hall}),{state:{catalogEventReturnTo:location.pathname+location.search}})
  const showMap=(id:number)=>{
    mapActionPending.current=true;setMessage('');update({tab:'map',focus:id,booth:null,q:''})
  }
  useEffect(()=>{
    if(!mapActionPending.current||state.tab!=='map')return
    mapActionPending.current=false
    const frame=requestAnimationFrame(()=>{mapHeading.current?.scrollIntoView({block:'start',behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});mapHeading.current?.focus({preventScroll:true})})
    return()=>cancelAnimationFrame(frame)
  },[state.tab,state.focus,state.booth])
  const visitChange=(day:string)=>{update({day,hall:'',focus:null,booth:null});setMessage('방문일 기준으로 참가 부스와 위치를 바꿨어요.')}
  const official=e.sources.find(s=>['OFFICIAL','ORGANIZER_SOCIAL'].includes(s.kind)&&s.access==='ORIGINAL'&&publicLink(s.url))
  const copyAddress=async()=>{try{await navigator.clipboard.writeText(e.address!);setMessage('주소를 복사했어요.')}catch{setMessage(`공개 주소: ${e.address} — 길게 눌러 복사해 주세요.`)}}
  return <section className="content-wrap section-pad visit-page"><SubcultureBackLink/>
    <Link className="discovery-back-link" to={back} state={{catalogRestore:true}}>← {categoryForType(e.subcategory).label} 목록</Link>
    <header className="visit-summary"><figure className="visit-poster"><ContentImage url={banner?.url} kind="event" alt={`${e.name} 대표 이미지`}/><figcaption>{banner ? <>{banner.credit} · <SafeLink url={banner.attribution}>이미지 출처</SafeLink><ReportLink target={{namespace:'CATALOG',type:'ASSET',eventId:Number(eventId),id:banner.id}} label="이미지 문제 신고"/></> : '기본 이미지 · 행사 이미지 준비 중'}</figcaption></figure><div className="visit-summary-copy"><div className="visit-summary-kicker"><p className="eyebrow">{labels[e.subcategory]} · 외부 행사 안내</p><span className={`chip visit-status is-${status.state}`}>{status.label}</span></div><h1>{e.name}</h1>
      {status.notice&&<p className="visit-important-note" role="status">{status.notice} {status.operation.sourceUrl&&<SafeLink url={status.operation.sourceUrl}>상태 안내 원문</SafeLink>}{status.operation.checkedOn&&<small> · {status.operation.checkedOn} 확인</small>}</p>}
      <dl className="visit-facts"><div><dt>행사일</dt><dd>{eventDateLabel(e.occurrences)}</dd></div>
        <div><dt>행사 시간</dt><dd>{eventTimeLabels(e.occurrences).map(label=><div key={label}>{label}</div>)}</dd></div>
        <div><dt>장소</dt><dd>{e.venueName||'장소 미공개·미확인'}{e.address&&<small>{e.address}</small>}</dd></div>
        <div><dt>입장</dt><dd>{e.admission||'입장 조건 미확인 · 무료 여부는 주최 공지를 확인하세요.'}</dd></div></dl>
      <div className="visit-primary-actions"><a className="btn primary" href="#visit-browse" onClick={()=>update({tab:'booths'})}>참가 부스 보기</a><a className="btn secondary" href="#visit-floor-plan" onClick={()=>update({tab:'map'})}>배치도에서 찾기</a>{official&&<SafeLink url={official.url}>공식 관람 안내 ↗</SafeLink>}</div>
    </div></header>
    <EventFollowup event={e} today={today}/>
    {secondUnavailable&&<div className="visit-important-note" role="alert">일요일 부스·배치도 정보를 지금은 불러오지 못했습니다. 토요일 안내만 표시 중입니다. <button className="btn secondary" type="button" onClick={onRetry}>다시 불러오기</button></div>}
    <nav id="visit-browse" className="visit-view-switch visit-main-tabs" role="tablist" aria-label="행사 상세 보기">
      {([['home','홈'],['booths','부스'],['reviews','후기']] as const).map(([tab,label])=><button key={tab} type="button" role="tab" id={`visit-tab-${tab}`} aria-selected={tab==='home'?homeTab:state.tab===tab} aria-controls={`visit-panel-${tab}`} className={(tab==='home'?homeTab:state.tab===tab)?'is-current':''} onClick={()=>update({tab})}>{label}</button>)}
    </nav>
    {params.get('day')&&params.get('day')!==state.day&&<p className="visit-important-note">링크의 날짜는 현재 공개된 운영일이 아니어서 가장 가까운 운영일을 표시합니다.</p>}
    <p role="status" className="visit-feedback">{message}</p>
    <div id="visit-panel-home" role="tabpanel" aria-labelledby="visit-tab-home" hidden={!homeTab}>
      <div className="visit-utility-actions">{usableAddress(e.address)&&<><SafeLink url={`https://map.kakao.com/?q=${encodeURIComponent(e.address!)}`}>장소 지도 ↗</SafeLink><button type="button" onClick={()=>void copyAddress()}>주소 복사</button></>}
        <SaveButton target={{type:'EVENT',eventId:Number(eventId),id:Number(eventId),participantId:null}} day={state.day} hall={state.hall}/><ShareQr target={{type:'EVENT',eventId:Number(eventId),id:Number(eventId),participantId:null}} day={state.day} hall={state.hall} title={e.name}/><ReportLink target={{namespace:'CATALOG',type:'EVENT',eventId:Number(eventId),id:Number(eventId),day:state.day,hall:state.hall}} viewedVersion={value.publishedAt}/></div>
      <section className="visit-home-map" aria-labelledby="visit-home-map-title"><div className="visit-list-heading"><div><p className="eyebrow">행사 현장</p><h2 id="visit-home-map-title">배치도</h2></div><small>날짜별 참가 부스 위치를 확인하세요.</small></div>
        <label className="field visit-home-day"><span>배치도 날짜</span><select className="select" value={state.day} onChange={ev=>visitChange(ev.target.value)}>{days.map(d=><option key={d} value={d}>{dateLabel(d)}</option>)}</select></label>
        <div id="visit-floor-plan" ref={mapHeading} tabIndex={-1} className="visit-map-section"><InteractiveFloorPlans key={mapEventId} eventId={mapEventId} event={e} assets={value.assets} participants={dayParticipants} day={state.day} hall={state.hall} query={state.tab==='map'?state.q:''} focusParticipantId={state.focus} onOpen={open} onList={()=>update({tab:'booths'})} onClear={()=>update({q:'',focus:null})} onlySaved={false} savedParticipantIds={[]}/></div>
      </section>
      <section className="panel visit-info" aria-label="행사 안내"><h2>행사 안내</h2>{e.operationStatus?.sourceUrl&&<details><summary>개최 상태의 확인 근거</summary><p>{e.operationStatus.note}</p><SafeLink url={e.operationStatus.sourceUrl}>상태 공지 원문</SafeLink><small> · {e.operationStatus.checkedOn} 확인</small></details>}<p className="visit-long-copy">{e.description}</p><h3>전체 운영일</h3>{e.occurrences.map((o,i)=><p key={i}>{o.startDate}{o.startDate!==o.endDate?` – ${o.endDate}`:''} · {o.startTime||'시간 미확인'}{o.endTime?` – ${o.endTime}`:''}</p>)}
        {!!e.warnings.length&&<><h3>방문 전 확인사항</h3>{e.warnings.map((w,i)=><p key={i}>{w}</p>)}</>}
        <h3>공식·참고 안내</h3>{e.sources.map((s,i)=><p key={i}><SafeLink url={s.url}>{sourceLabel(s.kind,s.url)}</SafeLink>{s.access!=='ORIGINAL'&&<small> · 원문 직접 확인 필요</small>}</p>)}
        {e.discoveryLinks?.filter(l=>l.url).map((l,i)=><p key={`l${i}`}><SafeLink url={l.url}>{({PARTICIPANTS:'공식 참가 명단',FLOOR_PLAN:'공식 배치도 게시물',SALES:'공식 판매 안내',OFFICIAL:'행사 공식 안내'} as Record<string,string>)[l.kind]||'행사 관련 안내'}</SafeLink>{l.note&&` · ${l.note}`}</p>)}
        <small>공개본 갱신: {new Date(value.publishedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}. 수집 후 변경될 수 있으므로 방문 전 주최 측 최신 공지를 확인하세요.</small>
      </section>
      <OwnershipPanel eventId={Number(eventId)}/>
      <p className="item-meta">로그인 없이 둘러볼 수 있어요. 예매·구매는 공식 안내를 확인하세요.</p>
      <Link className="btn secondary" to="/library">내 보관함에서 오프라인 정보 저장</Link>
      <EventHistory key={`history-${eventId}`} eventId={Number(eventId)}/>
    </div>
    <div id="visit-panel-booths" role="tabpanel" aria-labelledby="visit-tab-booths" hidden={state.tab!=='booths'}>
      <div className="visit-list-heading"><h2>참가 부스 찾기</h2><small>요일별 참가 부스가 다를 수 있습니다.</small></div>
      {daySpecificBooths&&<div className="visit-day-tabs" role="group" aria-label="참가 요일">{days.map(d=><button key={d} type="button" aria-pressed={state.day===d} className={state.day===d?'is-current':''} onClick={()=>visitChange(d)}>{dateLabel(d)} <span>{d===today?'오늘 · ':''}{second?(d===DFESTA_SUNDAY?'일요일 참가':'토요일 참가'):'참가 부스 보기'}</span></button>)}</div>}
      <div className={`visit-condition-row${daySpecificBooths?' is-series':''}`}>{!daySpecificBooths&&<label className="field"><span>방문일</span><select className="select" value={state.day} onChange={ev=>visitChange(ev.target.value)}>{days.map(d=><option key={d} value={d}>{dateLabel(d)}{d===today?' · 오늘':''}</option>)}{!days.length&&<option value="">일정 미확인</option>}</select></label>}
        <label className="field"><span>전시관</span><select className="select" value={state.hall} onChange={ev=>{update({hall:ev.target.value,focus:null,booth:null});setMessage('선택한 전시관 기준으로 안내해요.')}}><option value="">전체 전시관</option>{halls.map(h=><option key={h} value={h}>{h}</option>)}{state.hall&&!halls.some(h=>normalizePlace(h)===normalizePlace(state.hall))&&<option value={state.hall}>{state.hall} · 등록 위치 미확인</option>}</select></label>
        <label className="field visit-search"><span>부스·번호·작가·상품 찾기</span><input className="input" type="search" value={state.q} maxLength={100} placeholder="B1, 작가명, 달토끼 키링" onChange={ev=>update({q:ev.target.value,focus:null})}/></label>
      </div>
      <div className="memory-mode-switch" role="group" aria-label="내 관심 기준"><span>이 행사에서</span>{([['all','전체 부스'],['saved','저장한 부스'],['visited','방문 표시한 부스']] as const).map(([key,label])=><button type="button" key={key} className="btn secondary" aria-pressed={memoryMode===key} disabled={key!=='all'&&!memoryReady} onClick={()=>{const n=new URLSearchParams(params);if(key==='all')n.delete('my');else n.set('my',key);setParams(n,{replace:true,preventScrollReset:true})}}>{label}</button>)}<Link to={`/library?event=${eventId}`}>이 행사 보관함 →</Link></div>
      {(state.q||state.hall||memoryMode!=='all')&&<div className="visit-active-filters"><span>현재 조건 · {[state.q?`검색: ${state.q}`:'',state.hall,memoryMode==='saved'?'저장한 부스':memoryMode==='visited'?'방문 표시한 부스':''].filter(Boolean).join(' / ')}</span><button type="button" onClick={resetFilters}>조건 해제</button></div>}
      {memoryMode!=='all'&&<p className="item-meta">{memoryMode==='saved'?'상품을 저장한 업체도 함께 보여요.':'선택한 방문일에 직접 표시한 기록만 보여요. QR 스캔은 방문 기록이 아닙니다.'}</p>}
      {memoryBlocked?<div className="visit-memory-state" role={memoryError?'alert':'status'}><h2>{memoryError?'내 관심 목록을 확인하지 못했어요':'내 관심 목록을 확인하고 있어요'}</h2><p>공개된 전체 부스는 바로 볼 수 있어요.</p><button className="btn primary" type="button" onClick={resetFilters}>전체 부스 보기</button></div>
        :<section aria-label="참가 부스 목록"><div className="visit-list-heading"><h2>소개된 부스 <strong>{list.length}</strong>곳</h2><small>이 요일에 공개된 {dayParticipants.length}곳 중 현재 조건 · 전체 참가 명단은 아닙니다.</small></div>
          <div className="catalog-booth-grid">{list.map(p=><ParticipantCard key={p.id} eventId={sourceEventId(p.id)} row={p} day={state.day} hall={state.hall} assets={value.assets} showMap={showMap}/>)}</div>
          {!list.length&&<div className="visit-empty"><h3>현재 소개된 부스 중에는 결과가 없어요.</h3><p>미수집·위치 미확인은 실제 미참가를 뜻하지 않아요.</p><button className="btn secondary" onClick={resetFilters}>모든 부스 조건 해제</button></div>}</section>}
    </div>
    <div id="visit-panel-reviews" role="tabpanel" aria-labelledby="visit-tab-reviews" hidden={state.tab!=='reviews'}>
      <EventComments key={eventId} eventId={Number(eventId)}/>
    </div>
  </section>
}
function ParticipantCard({eventId,row,day,hall,assets,showMap}:{eventId:number;row:PublicParticipant;day:string;hall:string;assets:PublicEvent['assets'];showMap?:(id:number)=>void}) {
  const thumb=assets.find(a=>a.participantId===row.id&&['BOOTH_CUT','PRODUCT','LOGO'].includes(a.type))
  const locations=relevantLocations(row.participant.locations,day,hall),known=attendance(row,day,hall)
  return <article className="panel catalog-booth-card visit-booth-card has-image">
    <figure><ContentImage url={thumb?.url} kind="booth" alt={thumb?.caption||row.participant.registrationName}/><figcaption>{thumb ? <>{thumb.credit} · <SafeLink url={thumb.attribution}>출처</SafeLink></> : '기본 이미지'}</figcaption></figure>
    <div className="visit-booth-body"><LocationText locations={locations}/><h3>{row.participant.registrationName}</h3><p className="visit-booth-summary">{row.sales?.summary||'판매정보를 확인하고 있어요.'}</p>
      {known==='unknown'&&<small className="visit-warning">선택 날짜·전시관 참가 여부 미확인</small>}
      {row.sales&&<small>{scopes[row.sales.evidenceScope]}</small>}<p className="item-meta">{row.participant.subjects.join(' · ')}</p>
      <div className="row-actions"><SaveButton target={{type:'PARTICIPANT',eventId,id:row.id,participantId:row.id}} day={day} hall={hall} compact/>{showMap?<button className="btn secondary" onClick={()=>showMap(row.id)}>지도에서 보기</button>:<Link className="btn secondary" to={catalogEventPath(eventId,{day,hall},'map',row.id)}>지도에서 보기</Link>}<Link className="btn primary" to={catalogBoothPath(eventId,row.id,{day,hall})}>부스 상세</Link></div>
    </div></article>
}
