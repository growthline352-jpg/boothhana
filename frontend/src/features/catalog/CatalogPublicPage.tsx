import { eventSectionHref, legacyEventRedirect, parseEventPage } from '../../../seo/event-pages.mjs'
import {itineraryHref} from '../itinerary/links'
import { trackPublicAction } from '../analytics/actions'
import {discoveryFeatures} from '../discovery/features'
import {FirstVisitSummary} from './FirstVisitSummary'
import {compareHref} from '../discovery/compare'
import { hasMappableLocation } from './BoothDetail.utils'
import { BookingBadge } from './BookingBadge'
import { boothListReturn, boothVisit, eventSection, type EventSection } from './detailNavigation'
import { OwnershipPanel, EventHistory } from '../support/OwnershipPanels'
import { EventComments } from './EventComments'
import { EventEditionReviews } from '../subculture/EventEditionReviews'
import { subcultureEventsHref } from '../subculture/SubcultureUI'
import { PageMetadata } from '../../app/PageMetadata'
import { ApiError } from '../../api/client'
import { SaveButton } from '../library/SaveButton'
import { ShareQr } from '../library/ShareQr'
import { useLibrary } from '../library/LibraryProvider'
import { ReportLink } from '../support/ReportLink'
import { lazy, Suspense, useMemo, useRef, useEffect, useState } from 'react'
import { Link, Navigate, useParams, useLocation, useSearchParams, useNavigate } from 'react-router'
import { DiscoveryPage } from '../discovery/DiscoveryPage'
import { safeReturnTo, safeEventReturnTo, categoryForType, categoryHref } from '../discovery/categories'
import { dateLabel, eventDateLabel, eventTimeLabels, seoulToday } from '../discovery/browse'
import { useRemote } from '../../app/useRemote'
import { LoadingState, ErrorState } from '../../components/ui/States'
import { publicCatalogApi, type PublicEvent, type PublicParticipant } from './api'
import { combineOperatingDetails, operatingEventsForDay, selectOperatingEvent, combineDfesta, isDfestaDay, DFESTA_SATURDAY_ID, DFESTA_SUNDAY_ID, DFESTA_SUNDAY } from './eventGroup'
import { BoothDetail } from './BoothDetail'
const InteractiveFloorPlans=lazy(()=>import('../floorplan/InteractiveFloorPlans').then(module=>({default:module.InteractiveFloorPlans})))
import { floorplanApi } from '../floorplan/api'
import { hasFloorplanContent } from '../floorplan/availability'
import { matchesPublicParticipant, participantFacets, matchesParticipantFacet } from './publicSearch'
import { VisitorGuide } from './VisitorGuide'
import { InformationRequestButton } from '../support/InformationRequestButton'
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
  const {eventId=''}=useParams(),location=useLocation()
  const redirect=legacyEventRedirect(location.pathname,location.search)
  if(redirect)return <Navigate replace to={redirect} state={location.state}/>
  return <LoadEvent key={eventId} eventId={eventId}/>
}
export function CatalogPublicBoothDetail() {
  const {eventId='',participantId=''}=useParams()
  return <LoadBooth key={`${eventId}:${participantId}`} eventId={eventId} participantId={participantId}/>
}
function useDebouncedSearch(value:string) {
  const [current,setCurrent]=useState(value)
  useEffect(()=>{const timer=window.setTimeout(()=>setCurrent(value),250);return()=>window.clearTimeout(timer)},[value])
  return current
}
function LoadEvent({eventId}:{eventId:string}) {
  const location=useLocation(),[params]=useSearchParams(),library=useLibrary()
  const section=(parseEventPage(location.pathname)?.section||'home') as EventSection
  const search=useDebouncedSearch(params.get('q')||'')
  const query=new URLSearchParams()
  if(section==='booths')for(const key of ['page','day','hall','subject','category']){const value=params.get(key);if(value)query.set(key,value)}
  if(section==='booths'&&search)query.set('q',search)
  const reviewEntry=useRef({section,page:params.get('page')||''})
  if(reviewEntry.current.section!==section)reviewEntry.current={section,page:params.get('page')||''}
  if(section==='reviews'&&reviewEntry.current.page)query.set('page',reviewEntry.current.page)
  const memory=params.get('my')
  if(section==='booths'&&(memory==='saved'||memory==='visited')) {
    const selected=(library?.index||[]).filter(row=>row.target.eventId===Number(eventId)&&row.target.participantId!==null&&(memory!=='visited'||row.visitedDays.includes(params.get('day')||'')))
    const ids=[...new Set(selected.map(row=>row.target.participantId!))]
    // Zero is an explicit empty selection, not permission to show every public booth.
    query.set('ids',ids.length?ids.join(','):'0')
  }
  const memoryKey=memory==='saved'||memory==='visited'?`${library?.owner||''}:${library?.loading}:${(library?.index||[]).map(row=>`${row.target.eventId}:${row.target.participantId}:${row.visitedDays.join(',')}`).join(';')}`:''
  const requestQuery=query.toString(),day=params.get('day')||'',operating=params.get('operatingEvent')||''
  const state=useRemote('catalog:event-page',async()=>{
    const fetchPage=async(id:string)=>{
      if(section!=='booths'||(memory!=='saved'&&memory!=='visited'))return publicCatalogApi.eventPage(id,section,requestQuery)
      const chosen=[...new Set((library?.index||[]).filter(row=>row.target.eventId===Number(id)&&row.target.participantId!==null&&(memory!=='visited'||row.visitedDays.includes(day))).map(row=>row.target.participantId!))]
      const filters=new URLSearchParams(requestQuery)
      if(chosen.length<=200){filters.set('ids',chosen.join(',')||'0');return publicCatalogApi.eventPage(id,section,filters.toString())}
      // A large personal list is fetched in bounded public-ID batches; never put it in a page URL.
      const requestedPage=Number(filters.get('page')||0);filters.set('page','0');filters.set('size','100')
      const requests:Promise<PublicEvent>[]=[]
      for(let offset=0;offset<chosen.length;offset+=100){const batch=new URLSearchParams(filters);batch.set('ids',chosen.slice(offset,offset+100).join(','));requests.push(publicCatalogApi.eventPage(id,section,batch.toString()))}
      const batches=await Promise.all(requests),first=batches[0]
      const participants=batches.flatMap(batch=>batch.participants).sort((a,b)=>a.participant.registrationName.localeCompare(b.participant.registrationName,'ko-KR'))
      const people=participants.slice(requestedPage*24,(requestedPage+1)*24),ids=new Set(people.map(row=>row.id))
      return {...first,participants:people,assets:batches.flatMap(batch=>batch.assets).filter((asset,index,all)=>all.findIndex(a=>a.id===asset.id)===index&&(asset.participantId===null||ids.has(asset.participantId))),pagination:{page:requestedPage,size:24,total:participants.length}}
    }
    const primary=await fetchPage(eventId)
    if(primary.operatingGroup){
      const members=primary.operatingGroup.members.map(member=>member.eventId===primary.id?primary:{...primary,id:member.eventId,event:{...primary.event,name:member.name,venueName:member.venueName,occurrences:member.occurrences},participants:[],assets:[],banner:null})
      const display=combineOperatingDetails(primary,members),visit=parseVisit(params,display.event)
      const selected=selectOperatingEvent(members,visit.day,operating||eventId)
      if(selected.id!==primary.id){const actual=await fetchPage(String(selected.id));members.splice(members.findIndex(member=>member.id===actual.id),1,actual)}
      return {primary,alternate:null,members,display}
    }
    if(eventId===String(DFESTA_SATURDAY_ID)&&isDfestaDay(primary.id,primary.event.name)){
      const alternate=await publicCatalogApi.eventPage(String(DFESTA_SUNDAY_ID),day===DFESTA_SUNDAY?section:'home',day===DFESTA_SUNDAY?requestQuery:'').catch(error=>{if(isMissingPublicResource(error))return null;throw error})
      if(alternate&&isDfestaDay(alternate.id,alternate.event.name))return {primary,alternate,members:null,display:combineDfesta(primary,alternate)}
    }
    return {primary,alternate:null,members:null,display:primary}
  },[eventId,section,requestQuery,day,operating,memoryKey])
  const previous=useRef(state.data)
  if(state.data)previous.current=state.data
  const value=state.data||previous.current
  const pending=state.loading||(section==='booths'&&(params.get('q')||'')!==search)
  usePageScroll(!pending)
  if(!value)return <><PageMetadata pending unavailable={isMissingPublicResource(state.error)}/>{state.error?<ErrorState error={state.error} retry={()=>void state.reload()}/>:<LoadingState label="행사 정보를 불러오고 있어요"/>}</>
  return <><PageMetadata catalog={value.display} pending={pending} unavailable={!!state.error}/><CatalogEventDetail eventId={eventId} value={value.display} alternate={value.alternate} members={value.members} sectionOverride={section} pageLoading={pending} pageError={state.error} retryPage={()=>void state.reload()}/></>
}
function LoadBooth({eventId,participantId}:{eventId:string;participantId:string}) {
  const state=useRemote('catalog:booth-page',()=>publicCatalogApi.booth(eventId,participantId),[eventId,participantId])
  usePageScroll(!state.loading)
  if(state.loading)return <><PageMetadata pending/><LoadingState label="부스 정보를 불러오고 있어요"/></>
  const row=state.data?.participants.find(participant=>String(participant.id)===participantId)
  if(state.error||!state.data||!row)return <section className="content-wrap section-pad"><PageMetadata pending unavailable={isMissingPublicResource(state.error)||(!state.error&&!!state.data&&!row)}/><ErrorState error={state.error||new Error('공개 중인 부스 정보를 찾지 못했습니다.')} retry={()=>void state.reload()}/><Link className="btn secondary" to={eventSectionHref(eventId,'booths')}>참가 부스 목록</Link></section>
  return <><PageMetadata catalog={state.data} participant={row}/><CatalogBoothPage eventId={eventId} value={state.data} row={row}/></>
}
function isMissingPublicResource(error: unknown) {
  return error instanceof ApiError && [404,410].includes(error.status)
}
function CatalogBoothPage({eventId,value,row}:{eventId:string;value:PublicEvent;row:PublicParticipant}) {
  const location=useLocation(),navigate=useNavigate(),[params,setParams]=useSearchParams()
  const state=boothVisit(params,value.event,row),event=value.event
  const context={day:state.day,hall:state.hall}
  const canonicalEventPath=catalogEventPath(eventId,context)
  const storedReturn=(location.state as {catalogEventReturnTo?:unknown}|null)?.catalogEventReturnTo
  const eventReturn=boothListReturn(safeEventReturnTo(storedReturn,eventId,canonicalEventPath,value.operatingGroup?.members.map(member=>member.eventId)),state.day,state.hall)
  const status=eventStatus(event,seoulToday())
  const related=value.participants.filter(participant=>participant.id!==row.id&&attendance(participant,state.day,state.hall)!=='other')
  const relatedPreview=related.slice(0,4)
  const openMap=()=>{trackPublicAction('floorplan_open',{eventId:Number(eventId),participantId:row.id});void navigate(catalogEventPath(eventId,context,'map',row.id))}
  return <section className="content-wrap section-pad visit-page">
    <nav className="discovery-back-link" aria-label="현재 위치">
      <Link to="/">홈</Link>{' / '}<Link to={categoryForType(event.subcategory).key==='subculture'?subcultureEventsHref:categoryHref(categoryForType(event.subcategory).key)}>행사 목록</Link>{' / '}<Link to={eventReturn}>{event.name}</Link>{' / '}<span aria-current="page">부스 상세</span>
    </nav>
    <BoothDetail eventId={Number(eventId)} event={event} row={row} assets={value.assets.filter(asset=>asset.participantId===row.id)} day={state.day} hall={state.hall} eventNotice={status.notice} onMap={openMap} onVisitChange={(day,hall)=>{const next=new URLSearchParams(params);next.set('day',day);if(hall)next.set('hall',hall);else next.delete('hall');setParams(next,{replace:true,preventScrollReset:true,state:location.state})}} onClose={()=>void navigate(eventReturn,{state:{catalogRestore:true}})}/>
    {relatedPreview.length>0&&<section className="booth-related" aria-label="같은 행사 추천 부스">
      <div className="visit-list-heading"><h2>같은 행사에서 더 둘러보기</h2><Link to={eventReturn}>전체 부스 보기</Link></div>
      <div className="booth-related-grid">{relatedPreview.map(participant=><RelatedBoothCard key={participant.id} eventId={Number(eventId)} row={participant} day={state.day} hall={state.hall}/>)}</div>
    </section>}
  </section>
}
function RelatedBoothCard({eventId,row,day,hall}:{eventId:number;row:PublicParticipant;day:string;hall:string}) {
  const location=useLocation()
  const locations=relevantLocations(row.participant.locations,day,hall)
  return <Link className="booth-related-card" to={catalogBoothPath(eventId,row.id,{day,hall})} state={location.state}>
    <LocationText locations={locations}/><strong>{row.participant.registrationName}</strong>
    <small>{row.participant.subjects.slice(0,2).join(' · ')||'참가 정보 보기'}</small>
  </Link>
}
export function CatalogEventDetail({eventId,value,alternate=null,members=null,sectionOverride,pageLoading=false,pageError=null,retryPage}:{eventId:string;value:PublicEvent;alternate?:PublicEvent|null;members?:PublicEvent[]|null;sectionOverride?:EventSection;pageLoading?:boolean;pageError?:Error|null;retryPage?:()=>void}) {
  const location=useLocation(),navigate=useNavigate(),[params,setParams]=useSearchParams()
  const state=parseVisit(params,value.event),library=useLibrary()
  const currentValue=members?.length?selectOperatingEvent(members,state.day,params.get('operatingEvent')||eventId):alternate&&state.day===DFESTA_SUNDAY?alternate:value
  const operatingChoices=members?operatingEventsForDay(members,state.day):[]
  const currentEventId=currentValue.id
  const subject=(params.get('subject')||'').slice(0,150),category=(params.get('category')||'').slice(0,100)
  const subjectOptions=currentValue.facets?.subjects??[...new Set(currentValue.participants.flatMap(row=>participantFacets(row,'subject')))].sort((a,b)=>a.localeCompare(b,'ko-KR'))
  const categoryOptions=currentValue.facets?.categories??[...new Set(currentValue.participants.flatMap(row=>participantFacets(row,'category')))].sort((a,b)=>a.localeCompare(b,'ko-KR'))
  const dayParticipants=currentValue.participants.filter(row=>attendance(row,state.day)!=='other')
  const confirmedCount=dayParticipants.filter(row=>attendance(row,state.day)==='confirmed').length
  const e=alternate||members?{...currentValue.event,name:value.event.name,occurrences:value.event.occurrences}:value.event
  const hasBooths=(currentValue.participantCount??currentValue.participants.length)>0,requestedSection=sectionOverride??eventSection(params)
  const floorplanState=useRemote("features/catalog/CatalogPublicPage:CatalogEventDetail:floorplanState", ()=>requestedSection==='map'?floorplanApi.public(String(currentEventId)):Promise.resolve(null),[currentEventId,requestedSection==='map'])
  const detectedFloorplans=useMemo(()=>hasFloorplanContent(currentValue,floorplanState.data),[currentValue,floorplanState.data])
  const hasFloorplans=!!currentValue.sections?.map||detectedFloorplans||!!floorplanState.error||(floorplanState.loading&&requestedSection==='map')
  const section=sectionOverride??((!hasBooths&&requestedSection==='booths')||(!hasFloorplans&&requestedSection==='map')?'home':requestedSection),browsingBooths=section==='booths'||section==='map'
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
  const navigationState=location.state as {catalogReturnTo?:unknown;subcultureReturnTo?:unknown}|null
  const storedReturn=navigationState?.catalogReturnTo??navigationState?.subcultureReturnTo
  const back=storedReturn?safeReturnTo(storedReturn):categoryForType(e.subcategory).key==='subculture'?subcultureEventsHref:categoryHref(categoryForType(e.subcategory).key)
  const mapHeading=useRef<HTMLDivElement>(null),mapActionPending=useRef(false)
  const sectionNav=useRef<HTMLElement>(null),sectionActionPending=useRef(false)
  const [message,setMessage]=useState('')
  const rosterHalls=useMemo(()=>[...new Set(currentValue.participants.flatMap(p=>p.participant.locations)
    .flatMap(l=>relevantLocations([l],state.day)).map(l=>l.hall).filter((h):h is string=>!!h))].sort(),[currentValue.participants,state.day])
  const halls=currentValue.facets?.halls??rosterHalls
  const list=useMemo(()=>currentValue.pagination?currentValue.participants:currentValue.participants.filter(p=>attendance(p,state.day,state.hall)!=='other')
    .filter(p=>matchesPublicParticipant({...p,participant:{...p.participant,locations:relevantLocations(p.participant.locations,state.day,state.hall)}},state.q))
    .filter(p=>matchesParticipantFacet(p,'subject',subject)&&matchesParticipantFacet(p,'category',category))
    .filter(p=>memoryMode==='all'||memoryFilter.has(p.id)),[currentValue.participants,state.day,state.hall,state.q,subject,category,memoryMode,memoryFilter])
  const banner=currentValue.banner===undefined?currentValue.assets.find(a=>a.type==='BANNER'&&a.participantId===null):currentValue.banner
  const update=(patch:Partial<VisitQuery>)=>{
    const next={...state,...patch}
    const qs=visitParams(next);if(memoryMode!=='all')qs.set('my',memoryMode)
    if(subject)qs.set('subject',subject);if(category)qs.set('category',category)
    const nextSection=patch.tab==='map'?'map':patch.tab==='info'?'home':patch.tab==='booths'?'booths':section
    qs.delete('page')
    if(sectionOverride)navigate(eventSectionHref(eventId,nextSection,qs),{replace:nextSection===section,preventScrollReset:true,state:location.state})
    else {qs.set('section',nextSection);setParams(qs,{replace:true,preventScrollReset:true,state:location.state})}
  }
  const chooseSection=(next:EventSection)=>{
    if(next!==section&&next==='booths')trackPublicAction('booth_list_open',{eventId:currentEventId})
    if(next!==section&&next==='map')trackPublicAction('floorplan_open',{eventId:currentEventId})
    if(next===section){sectionNav.current?.scrollIntoView({block:'start',behavior:'auto'});return}
    sectionActionPending.current=true
    const qs=visitParams({...state,tab:next==='map'?'map':next==='booths'?'booths':'info',focus:null})
    if(memoryMode!=='all')qs.set('my',memoryMode)
    if(subject)qs.set('subject',subject);if(category)qs.set('category',category)
    qs.delete('page')
    if(sectionOverride)navigate(eventSectionHref(eventId,next,qs),{preventScrollReset:true,state:location.state})
    else {qs.set('section',next);setParams(qs,{replace:true,preventScrollReset:true,state:location.state})}
  }
  useEffect(()=>{
    if(!sectionActionPending.current)return
    sectionActionPending.current=false
    const frame=requestAnimationFrame(()=>{
      sectionNav.current?.scrollIntoView({block:'start',behavior:'auto'})
      sectionNav.current?.querySelector<HTMLAnchorElement>('[aria-current="page"]')?.focus({preventScroll:true})
    })
    return()=>cancelAnimationFrame(frame)
  },[section,currentValue.pagination?.page])
  const resetFilters=()=>{
    const next=resetVisitFilters(params,e)
    next.delete('page');if(!sectionOverride&&section!=='home')next.set('section',section)
    setParams(next,{replace:true,preventScrollReset:true,state:location.state})
    setMessage('방문일은 유지하고 검색·전시관·내 관심 조건을 모두 해제했어요.')
  }
  const open=(id:number)=>void navigate(catalogBoothPath(currentEventId,id,{day:state.day,hall:state.hall}),{state:{catalogEventReturnTo:location.pathname+location.search}})
  const showMap=(id:number)=>{
    trackPublicAction('floorplan_open',{eventId:currentEventId,participantId:id})
    mapActionPending.current=true;setMessage('');update({tab:'map',focus:id,booth:null,q:''})
  }
  useEffect(()=>{
    if(!mapActionPending.current||section!=='map')return
    mapActionPending.current=false
    const frame=requestAnimationFrame(()=>{mapHeading.current?.scrollIntoView({block:'start',behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});mapHeading.current?.focus({preventScroll:true})})
    return()=>cancelAnimationFrame(frame)
  },[section,state.focus,state.booth])
  const visitChange=(day:string)=>{update({day,hall:'',focus:null,booth:null});setMessage('방문일 기준으로 참가 부스와 위치를 바꿨어요.')}
  const operatingVenueSelect=operatingChoices.length>1&&<label className={section==='home'?'field event-visit-day':'field'}><span>운영 행사·전시장</span><select className="select" value={currentEventId} onChange={ev=>{const next=new URLSearchParams(params);next.set('operatingEvent',ev.target.value);next.delete('hall');next.delete('focus');next.delete('page');setParams(next,{replace:true,preventScrollReset:true,state:location.state})}}>{operatingChoices.map(row=><option key={row.id} value={row.id}>{row.event.name} · {row.event.venueName||'장소 미확인'}</option>)}</select></label>
  const official=e.sources.find(s=>['OFFICIAL','ORGANIZER_SOCIAL'].includes(s.kind)&&s.access==='ORIGINAL'&&publicLink(s.url))
  const mapQuery=usableAddress(e.address)?e.address:e.venueName
  const primaryActions=<div className="visit-primary-actions" aria-label="행사 방문 준비">
    {hasBooths&&<button type="button" className="btn primary" onClick={()=>chooseSection('booths')}>소개된 부스 {currentValue.participantCount??currentValue.participants.length}곳 보기</button>}
    {hasFloorplans&&<button type="button" className="btn secondary" onClick={()=>chooseSection('map')}>배치도 보기</button>}
    {mapQuery&&<SafeLink url={`https://map.kakao.com/?q=${encodeURIComponent(mapQuery)}`}>{usableAddress(e.address)?'장소 지도 ↗':'장소명으로 지도 검색 ↗'}</SafeLink>}
    {official&&<SafeLink url={official.url}>공식 관람 안내 ↗</SafeLink>}
  </div>
  const copyAddress=async()=>{try{await navigator.clipboard.writeText(e.address!);setMessage('주소를 복사했어요.')}catch{setMessage(`공개 주소: ${e.address} — 길게 눌러 복사해 주세요.`)}}
  return <section className="content-wrap section-pad visit-page event-detail-redesign" data-analytics-event-id={currentEventId}>
    <Link className="discovery-back-link" to={back} state={{catalogRestore:true}}>← {categoryForType(e.subcategory).label} 목록</Link>
    <header className="visit-summary"><figure className="visit-poster"><ContentImage url={banner?.url} kind="event" eventType={e.subcategory} alt={`${e.name} 대표 이미지`}/>{banner&&<figcaption><ReportLink target={{namespace:'CATALOG',type:'ASSET',eventId:currentEventId,id:banner.id}} label="이미지 문제 신고"/></figcaption>}</figure><div className="visit-summary-copy"><div className="visit-summary-kicker"><p className="eyebrow">{labels[e.subcategory]} · 행사 안내</p><span className={`chip visit-status is-${status.state}`}>{status.label}</span></div><h1>{e.name}{section!=='home'&&` · ${{booths:'참가 부스·굿즈',map:'배치도',reviews:'후기'}[section]}`}</h1><BookingBadge event={e} day={state.day}/>
      {status.notice&&<p className="visit-important-note" role="status">{status.notice} {status.operation.sourceUrl&&<SafeLink url={status.operation.sourceUrl}>상태 안내 원문</SafeLink>}{status.operation.checkedOn&&<small> · {status.operation.checkedOn} 확인</small>}</p>}
      {primaryActions}
      <dl className="visit-facts"><div><dt>행사일</dt><dd>{eventDateLabel(e.occurrences)}</dd></div>
        <div><dt>행사 시간</dt><dd>{eventTimeLabels(e.occurrences).map(label=><div key={label}>{label}</div>)}</dd></div>
        <div><dt>장소</dt><dd>{e.venueName||'장소 미공개·미확인'}{e.address&&<small>{e.address}</small>}</dd></div>
        <div><dt>입장</dt><dd>{e.admission||'입장 조건 미확인 · 무료 여부는 주최 공지를 확인하세요.'}</dd></div></dl>
      {section==='home'&&days.length>1&&<label className="field event-visit-day"><span>방문일</span><select className="select" value={state.day} onChange={ev=>visitChange(ev.target.value)}>{days.map(day=><option key={day} value={day}>{dateLabel(day)}{day===today?' · 오늘':''}</option>)}</select></label>}
      {section==='home'&&operatingVenueSelect}
      {section==='home'&&categoryForType(e.subcategory).key!=='subculture'&&<FirstVisitSummary event={e}/>}
      <div className="visit-utility-actions"><Link className="btn secondary" to={itineraryHref(currentEventId,state.day)}>이 행사로 일정 만들기</Link>{discoveryFeatures.comparison&&<Link to={compareHref([currentEventId])}>다른 행사와 비교</Link>}{usableAddress(e.address)&&<button type="button" onClick={()=>void copyAddress()}>주소 복사</button>}
        <SaveButton target={{type:'EVENT',eventId:currentEventId,id:currentEventId,participantId:null}} day={state.day} hall={state.hall}/><ShareQr target={{type:'EVENT',eventId:currentEventId,id:currentEventId,participantId:null}} day={state.day} hall={state.hall} title={e.name}/><ReportLink target={{namespace:'CATALOG',type:'EVENT',eventId:currentEventId,id:currentEventId,day:state.day,hall:state.hall}} viewedVersion={currentValue.publishedAt}/></div>
    </div></header>
    <nav ref={sectionNav} className="visit-main-tabs" aria-label="행사 상세 메뉴">{([['home','행사 안내'],['booths',categoryForType(e.subcategory).key==='subculture'?'참가 부스·굿즈':'부스'],['map','배치도'],['reviews',categoryForType(e.subcategory).key==='subculture'?'이번·지난 회차 후기':'후기']] as const).filter(([key])=>!!sectionOverride||((key!=='booths'||hasBooths)&&(key!=='map'||hasFloorplans))).map(([key,label])=><Link key={key} aria-current={section===key?'page':undefined} className={section===key?'is-current':''} to={eventSectionHref(eventId,key,new URLSearchParams([...params].filter(([name])=>name!=='page')))} state={location.state} preventScrollReset onClick={()=>{sectionActionPending.current=true}}>{label}</Link>)}</nav>
    {pageLoading&&<p role="status" aria-live="polite">선택한 조건의 정보를 불러오고 있어요…</p>}
    {pageError&&<ErrorState error={pageError} retry={retryPage}/>}
    {browsingBooths&&<section id="visit-browse" className="visit-controls" aria-label="방문 조건 및 부스 검색"><div className="visit-controls-head"><div><p className="eyebrow">{section==='map'?'배치도':'참가 부스'}</p><h2>{section==='map'?'날짜별 배치도':'부스 찾기'}</h2></div></div>
    <div className="visit-condition-row">
      <label className="field"><span>방문일</span><select className="select" value={state.day} onChange={ev=>visitChange(ev.target.value)}>{days.map(d=><option key={d} value={d}>{dateLabel(d)}{d===today?' · 오늘':''}</option>)}{!days.length&&<option value="">일정 미확인</option>}</select></label>
      {operatingVenueSelect}

      <label className="field"><span>전시관</span><select className="select" value={state.hall} onChange={ev=>{update({hall:ev.target.value,focus:null,booth:null});setMessage('선택한 전시관 기준으로 안내해요.')}}><option value="">전체 전시관</option>{halls.map(h=><option key={h} value={h}>{h}</option>)}{state.hall&&!halls.some(h=>normalizePlace(h)===normalizePlace(state.hall))&&<option value={state.hall}>{state.hall} · 등록 위치 미확인</option>}</select></label>
      <label className="field visit-search"><span>{section==='map'?'배치도에서 부스 찾기':'부스·번호·작가·상품 찾기'}</span><input className="input" type="search" value={state.q} maxLength={100} placeholder="B1, 작가명, 달토끼 키링" onChange={ev=>update({q:ev.target.value,focus:null})}/></label>
    </div><p role="status" className="visit-feedback">{message}</p>
    {params.get('day')&&params.get('day')!==state.day&&<p className="visit-important-note">링크의 날짜는 현재 공개된 운영일이 아니어서 가장 가까운 운영일을 표시합니다.</p>}</section>}
    {browsingBooths&&<><div className="visit-facet-row"><label className="field"><span>작품·취향 주제</span><select className="select" value={subject} onChange={ev=>{const n=new URLSearchParams(params);if(ev.target.value)n.set('subject',ev.target.value);else n.delete('subject');n.delete('page');setParams(n,{replace:true,preventScrollReset:true,state:location.state})}}><option value="">전체 주제</option>{subject&&!subjectOptions.includes(subject)&&<option value={subject}>{subject}</option>}{subjectOptions.map(v=><option key={v} value={v}>{v}</option>)}</select></label><label className="field"><span>취급 품목</span><select className="select" value={category} onChange={ev=>{const n=new URLSearchParams(params);if(ev.target.value)n.set('category',ev.target.value);else n.delete('category');n.delete('page');setParams(n,{replace:true,preventScrollReset:true,state:location.state})}}><option value="">전체 품목</option>{category&&!categoryOptions.includes(category)&&<option value={category}>{category}</option>}{categoryOptions.map(v=><option key={v} value={v}>{v}</option>)}</select></label></div><div className="memory-mode-switch" role="group" aria-label="내 관심 기준"><span>이 행사에서</span>{([['all','전체 부스'],['saved','저장한 부스'],['visited','방문 표시한 부스']] as const).map(([key,label])=><button type="button" key={key} className="btn secondary" aria-pressed={memoryMode===key} disabled={key!=='all'&&!memoryReady} onClick={()=>{const n=new URLSearchParams(params);if(key==='all')n.delete('my');else n.set('my',key);setParams(n,{replace:true,preventScrollReset:true,state:location.state})}}>{label}</button>)}<Link to={`/library?event=${currentEventId}`}>이 행사 보관함 →</Link></div>
    {(state.q||state.hall||subject||category||memoryMode!=='all')&&<div className="visit-active-filters"><span>현재 조건 · {[state.q?`검색: ${state.q}`:'',state.hall,subject,category,memoryMode==='saved'?'저장한 부스':memoryMode==='visited'?'방문 표시한 부스':''].filter(Boolean).join(' / ')}</span><button type="button" onClick={resetFilters}>조건 해제</button></div>}
    {memoryMode!=='all'&&<p className="item-meta">{memoryMode==='saved'?'상품을 저장한 업체도 함께 보여요. 배치도는 저장한 부스를 강조하며 다른 부스 위치를 바꾸지 않아요.':'선택한 방문일에 직접 표시한 기록만 보여요. QR 스캔은 방문 기록이 아닙니다.'}</p>}</>}
    {memoryBlocked&&browsingBooths&&<div className="visit-memory-state" role={memoryError?'alert':'status'}>
      <h2>{memoryError?'내 관심 목록을 확인하지 못했어요':'내 관심 목록을 확인하고 있어요'}</h2>
      <p>기록을 확인하기 전에는 부스가 없다고 판단하지 않습니다. 공개된 전체 부스는 바로 볼 수 있어요.</p>
      <div className="row-actions"><button className="btn primary" type="button" onClick={resetFilters}>전체 부스 보기</button><Link className="btn secondary" to={`/library?event=${currentEventId}`}>보관함에서 확인</Link></div>
    </div>}
    {section==='booths'&&!memoryBlocked&&!pageLoading&&!pageError&&<section aria-label="참가 부스 목록">
      <div className="visit-list-heading"><h2>소개된 부스 <strong>{currentValue.pagination?.total??list.length}</strong>곳</h2><small>{currentValue.pagination?`이 페이지 ${list.length}곳 · `:`선택일 참가 확인 ${confirmedCount}곳 / 참가일 미확인 ${dayParticipants.length-confirmedCount}곳 · `}소개된 정보 기준이며 전체 참가 명단은 아닙니다.</small></div>
      <div className="catalog-booth-grid">{list.map(p=><ParticipantCard key={p.id} eventId={currentEventId} row={p} day={state.day} hall={state.hall} assets={currentValue.assets} showMap={showMap}/>)}</div>
      {currentValue.pagination&&currentValue.pagination.total>currentValue.pagination.size&&<BoothPagination value={currentValue} params={params} eventId={eventId}/>}
      {!list.length&&<div className="visit-empty"><h3>현재 소개된 부스 중에는 결과가 없어요.</h3><p>미수집·위치 미확인은 실제 미참가를 뜻하지 않아요.</p><div className="row-actions"><button className="btn secondary" onClick={resetFilters}>모든 부스 조건 해제</button><button className="btn secondary" onClick={()=>chooseSection('home')}>행사 안내 확인</button><InformationRequestButton kind="BOOTH" eventId={currentEventId} day={state.day} query={state.q}/></div></div>}
    </section>}
    {section==='map'&&!memoryBlocked&&!pageLoading&&!pageError&&<div ref={mapHeading} tabIndex={-1} className="visit-map-section"><Suspense fallback={<LoadingState label="배치도를 불러오고 있어요"/>}><InteractiveFloorPlans state={floorplanState} eventId={String(currentEventId)} event={currentValue.event} assets={currentValue.assets} participants={currentValue.participants} day={state.day} hall={state.hall} query={state.q} focusParticipantId={state.focus} onOpen={open} onList={()=>chooseSection('booths')} onClear={()=>update({q:'',focus:null})} onlySaved={memoryMode!=='all'} savedParticipantIds={memoryReady?[...memoryFilter]:[]} facetParticipantIds={subject||category?currentValue.participants.filter(p=>matchesParticipantFacet(p,'subject',subject)&&matchesParticipantFacet(p,'category',category)).map(p=>p.id):undefined}/></Suspense></div>}
    {section==='home'&&<section className="panel visit-info" aria-label="행사 안내"><h2>행사 안내</h2>{e.operationStatus?.sourceUrl&&<details><summary>개최 상태의 확인 근거</summary><p>{e.operationStatus.note}</p><SafeLink url={e.operationStatus.sourceUrl}>상태 공지 원문</SafeLink><small> · {e.operationStatus.checkedOn} 확인</small></details>}<p className="visit-long-copy">{e.description}</p><h3>전체 운영일</h3>{e.occurrences.map((o,i)=><p key={i}>{o.startDate}{o.startDate!==o.endDate?` – ${o.endDate}`:''} · {o.startTime||'시간 미확인'}{o.endTime?` – ${o.endTime}`:''}</p>)}
      {!!e.warnings.length&&<><h3>방문 전 확인사항</h3>{e.warnings.map((w,i)=><p key={i}>{w}</p>)}</>}
      <h3>공식·참고 안내</h3>{e.sources.map((s,i)=><p key={i}><SafeLink url={s.url}>{sourceLabel(s.kind,s.url)}</SafeLink>{s.access!=='ORIGINAL'&&<small> · 원문 직접 확인 필요</small>}</p>)}
      {e.discoveryLinks?.filter(l=>l.url).map((l,i)=><p key={`l${i}`}><SafeLink url={l.url}>{({PARTICIPANTS:'공식 참가 명단',FLOOR_PLAN:'공식 배치도 게시물',SALES:'공식 판매 안내',OFFICIAL:'행사 공식 안내'} as Record<string,string>)[l.kind]||'행사 관련 안내'}</SafeLink>{l.note&&` · ${l.note}`}</p>)}
      <small>공개본 갱신: {new Date(currentValue.publishedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}. 수집 후 변경될 수 있으므로 방문 전 주최 측 최신 공지를 확인하세요.</small>
    </section>}
    {section==='home'&&<div>{categoryForType(e.subcategory).key==='subculture'&&<FirstVisitSummary event={e}/>}<VisitorGuide value={currentValue} day={state.day}/></div>}
    {section==='home'&&<div><Link className="btn secondary" to={`/creator/catalog/events/${currentEventId}/booths/new`}>내 부스 등록</Link><OwnershipPanel eventId={currentEventId}/><Link className="btn secondary" to="/library">내 보관함에서 오프라인 정보 저장</Link><EventHistory key={`history-${eventId}`} eventId={Number(eventId)}/></div>}
    {section==='reviews'&&!pageLoading&&!pageError&&<div>{categoryForType(e.subcategory).key==='subculture'?<EventEditionReviews key={eventId} eventId={Number(eventId)} name={e.name} initial={currentValue.reviewsPage}/>:<EventComments key={eventId} eventId={Number(eventId)} initial={currentValue.reviewsPage} pageQuery/>}</div>}
  </section>
}
function BoothPagination({value,params,eventId}:{value:PublicEvent;params:URLSearchParams;eventId:string}) {
  const {page,size,total}=value.pagination!
  const href=(next:number)=>{const query=new URLSearchParams(params);if(next)query.set('page',String(next));else query.delete('page');return eventSectionHref(eventId,'booths',query)}
  return <nav className="row-actions" aria-label="참가 부스 목록 페이지">{page>0&&<Link className="btn secondary" to={href(page-1)}>이전 부스</Link>}<span>{page+1} / {Math.max(1,Math.ceil(total/size))} 페이지</span>{(page+1)*size<total&&<Link className="btn secondary" to={href(page+1)}>다음 부스</Link>}</nav>
}
function ParticipantCard({eventId,row,day,hall,assets,showMap}:{eventId:number;row:PublicParticipant;day:string;hall:string;assets:PublicEvent['assets'];showMap?:(id:number)=>void}) {
  const location=useLocation()
  const thumb=assets.find(a=>a.participantId===row.id&&['BOOTH_CUT','PRODUCT','LOGO','BANNER','SALES_SHEET'].includes(a.type))
  const locations=relevantLocations(row.participant.locations,day,hall),known=attendance(row,day,hall)
  return <article className="panel catalog-booth-card visit-booth-card has-image">
    <figure><ContentImage url={thumb?.url} kind="booth" alt={thumb?.caption||row.participant.registrationName}/></figure>
    <div className="visit-booth-body"><LocationText locations={locations}/><h3>{row.participant.registrationName}</h3>{row.directRegistration&&<span className="chip">직접 등록</span>}<p className="visit-booth-summary">{row.sales?.summary||'판매정보를 확인하고 있어요.'}</p>
      {known==='unknown'&&<small className="visit-warning">선택 날짜·전시관 참가 여부 미확인</small>}
      {row.sales&&<small>{scopes[row.sales.evidenceScope]}</small>}<p className="item-meta">{row.participant.subjects.join(' · ')}</p>
      </div><div className="row-actions"><SaveButton target={{type:'PARTICIPANT',eventId,id:row.id,participantId:row.id}} day={day} hall={hall} compact/>{hasMappableLocation(row,day,hall)&&(showMap?<button className="btn secondary" onClick={()=>showMap(row.id)}>지도에서 보기</button>:<Link className="btn secondary" to={catalogEventPath(eventId,{day,hall},'map',row.id)}>지도에서 보기</Link>)}<Link className="btn primary" to={catalogBoothPath(eventId,row.id,{day,hall})} state={{catalogEventReturnTo:location.pathname+location.search}}>부스 상세</Link></div>
    </article>
}
