import { OfflineDownloadPanel } from '../offline/OfflineDownloadPanel'
import { PageMetadata } from '../../app/PageMetadata'
import { SaveButton } from '../library/SaveButton'
import { ShareQr } from '../library/ShareQr'
import { useLibrary } from '../library/LibraryProvider'
import { ReportLink } from '../support/ReportLink'
import { useMemo, useRef, useEffect, useState } from 'react'
import { Link, useParams, useLocation, useSearchParams, useNavigate } from 'react-router'
import { DiscoveryPage } from '../discovery/DiscoveryPage'
import { safeReturnTo, categoryForType, categoryHref } from '../discovery/categories'
import { dateLabel, seoulToday } from '../discovery/browse'
import { useRemote } from '../../app/useRemote'
import { LoadingState, ErrorState } from '../../components/ui/States'
import { publicCatalogApi, type PublicEvent, type PublicParticipant } from './api'
import { BoothDrawer } from './BoothDrawer'
import { InteractiveFloorPlans } from '../floorplan/InteractiveFloorPlans'
import { matchesPublicParticipant } from './publicSearch'
import { labels, scopes, SafeLink, LocationText, StoredImage } from './Shared'
import { attendance, relevantLocations, parseVisit, visitParams, resetVisitFilters, visitDays, publicLink, sourceLabel, usableAddress, normalizePlace, type VisitQuery } from '../visit/visit'
import { eventStatus } from '../visit/eventStatus'
import { usePageScroll } from '../visit/ScrollMemory'
import '../visit/visit.css'
import './catalog.css'

export function CatalogPublicPage() { return <DiscoveryPage/> }
export function CatalogPublicDetail() {
  const {eventId=''}=useParams()
  return <LoadEvent key={eventId} eventId={eventId}/>
}
function LoadEvent({eventId}:{eventId:string}) {
  const state=useRemote(()=>publicCatalogApi.event(eventId),[eventId])
  usePageScroll(!state.loading)
  if(state.loading)return <><PageMetadata /><a className="btn secondary" href={`/offline/index.html#${eventId}`}>통신이 느린가요? 저장 자료 바로 열기</a><LoadingState label="행사 안내를 불러오고 있어요"/></>
  if(state.error||!state.data)return <section className="content-wrap section-pad"><PageMetadata unavailable /><ErrorState error={state.error||new Error('공개 안내를 찾지 못했습니다.')} retry={()=>void state.reload()}/><Link className="btn secondary" to="/discover">다른 행사 찾기</Link><a className="btn secondary" href={`/offline/index.html#${eventId}`}>저장 자료 바로 열기</a></section>
  return <><PageMetadata catalog={state.data} /><CatalogEventDetail eventId={eventId} value={state.data}/></>
}
export function CatalogEventDetail({eventId,value}:{eventId:string;value:PublicEvent}) {
  const location=useLocation(),navigate=useNavigate(),[params,setParams]=useSearchParams()
  const state=parseVisit(params,value.event),e=value.event,library=useLibrary()
  const memoryMode=params.get('my')==='saved'?'saved':params.get('my')==='visited'?'visited':'all'
  const savedParticipants=useMemo(()=>new Set((library?.index||[]).filter(x=>x.target.eventId===Number(eventId)&&x.target.participantId!==null).map(x=>x.target.participantId!)),[library?.index,eventId])
  const visitedParticipants=useMemo(()=>new Set((library?.index||[]).filter(x=>x.target.eventId===Number(eventId)&&x.target.participantId!==null&&x.visitedDays.includes(state.day)).map(x=>x.target.participantId!)),[library?.index,eventId,state.day])
  const memoryFilter=memoryMode==='saved'?savedParticipants:visitedParticipants
  const memoryReady=!!library&&(library.owner==='guest'||library.owner.startsWith('member:'))&&!library.loading&&!library.error
  const memoryBlocked=memoryMode!=='all'&&!memoryReady
  const memoryError=library?.owner==='error'||!!library?.error
  const [today,setToday]=useState(()=>seoulToday())
  useEffect(()=>{const id=window.setInterval(()=>setToday(seoulToday()),60_000);return()=>clearInterval(id)},[])
  const status=eventStatus(e,today),days=visitDays(e)
  const storedReturn=(location.state as {catalogReturnTo?:unknown}|null)?.catalogReturnTo
  const back=storedReturn?safeReturnTo(storedReturn):categoryHref(categoryForType(e.subcategory).key)
  const trigger=useRef<HTMLElement|null>(null),mapHeading=useRef<HTMLDivElement>(null),mapActionPending=useRef(false)
  const [message,setMessage]=useState('')
  const halls=useMemo(()=>[...new Set(value.participants.flatMap(p=>p.participant.locations)
    .filter(l=>!l.startDate||!l.endDate||(l.startDate<=state.day&&l.endDate>=state.day)).map(l=>l.hall).filter((h):h is string=>!!h))].sort(),[value.participants,state.day])
  const list=useMemo(()=>value.participants.filter(p=>attendance(p,state.day,state.hall)!=='other')
    .filter(p=>matchesPublicParticipant({...p,participant:{...p.participant,locations:relevantLocations(p.participant.locations,state.day,state.hall)}},state.q)).filter(p=>memoryMode==='all'||memoryFilter.has(p.id)),[value.participants,state.day,state.hall,state.q,memoryMode,memoryFilter])
  const chosen=value.participants.find(p=>p.id===state.booth)
  const banner=value.banner===undefined?value.assets.find(a=>a.type==='BANNER'&&a.participantId===null):value.banner
  const routeState=(location.state||{}) as Record<string,unknown>
  const update=(patch:Partial<VisitQuery>,push=false)=>{
    const next={...state,...patch}
    const metadata={...routeState}
    if(push)metadata.catalogModalFrom=location.pathname+location.search
    else if(patch.booth===null)delete metadata.catalogModalFrom
    const qs=visitParams(next);if(memoryMode!=='all')qs.set('my',memoryMode);setParams(qs,{replace:!push,preventScrollReset:true,state:metadata})
  }
  const resetFilters=()=>{
    const metadata={...routeState};delete metadata.catalogModalFrom
    setParams(resetVisitFilters(params,e),{replace:true,preventScrollReset:true,state:metadata})
    setMessage('방문일은 유지하고 검색·전시관·내 관심 조건을 모두 해제했어요.')
  }
  const open=(id:number,element:HTMLElement)=>{trigger.current=element;update({booth:id},!state.booth)}
  const close=()=>{
    // Deep-linked modals have no local predecessor: do not navigate away from the application.
    if(typeof routeState.catalogModalFrom==='string'&&routeState.catalogModalFrom.split('?')[0]===`/discover/${eventId}`)void navigate(-1)
    else update({booth:null})
  }
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
  const shareUrl=new URL(`${location.pathname}?${visitParams(state)}`,window.location.origin).href
  const selectedOccurrence=e.occurrences.find(o=>o.startDate<=state.day&&o.endDate>=state.day)
  const official=e.sources.find(s=>['OFFICIAL','ORGANIZER_SOCIAL'].includes(s.kind)&&s.access==='ORIGINAL'&&publicLink(s.url))
  const copyAddress=async()=>{try{await navigator.clipboard.writeText(e.address!);setMessage('주소를 복사했어요.')}catch{setMessage(`공개 주소: ${e.address} — 길게 눌러 복사해 주세요.`)}}
  return <section className="content-wrap section-pad visit-page">
    <Link className="discovery-back-link" to={back} state={{catalogRestore:true}}>← {categoryForType(e.subcategory).label} 목록</Link>
    <header className="visit-summary"><div className="visit-summary-copy"><p className="eyebrow">{labels[e.subcategory]} · 외부 행사 안내</p>
      <span className={`chip visit-status is-${status.state}`}>{status.label}</span><h1>{e.name}</h1>
      {status.notice&&<p className="visit-important-note" role="status">{status.notice} {status.operation.sourceUrl&&<SafeLink url={status.operation.sourceUrl}>상태 안내 원문</SafeLink>}{status.operation.checkedOn&&<small> · {status.operation.checkedOn} 확인</small>}</p>}
      <dl className="visit-facts"><div><dt>방문일</dt><dd>{state.day?dateLabel(state.day):'일정 확인 필요'} · {selectedOccurrence?.startTime||'시간 미확인'}{selectedOccurrence?.endTime?` – ${selectedOccurrence.endTime}`:''}</dd></div>
        <div><dt>장소</dt><dd>{e.venueName||'장소 미공개·미확인'}{e.address&&<small>{e.address}</small>}</dd></div>
        <div><dt>입장</dt><dd>{e.admission||'입장 조건 미확인 · 무료 여부는 주최 공지를 확인하세요.'}</dd></div></dl>
      <div className="visit-actions">{official&&<SafeLink url={official.url}>공식 관람 안내 ↗</SafeLink>}
        {usableAddress(e.address)&&<><SafeLink url={`https://map.kakao.com/?q=${encodeURIComponent(e.address!)}`}>장소 지도 ↗</SafeLink><button className="btn secondary" onClick={()=>void copyAddress()}>주소 복사</button></>}
        <SaveButton target={{type:'EVENT',eventId:Number(eventId),id:Number(eventId),participantId:null}} day={state.day} hall={state.hall}/><ShareQr target={{type:'EVENT',eventId:Number(eventId),id:Number(eventId),participantId:null}} day={state.day} hall={state.hall} title={e.name}/><ReportLink target={{namespace:'CATALOG',type:'EVENT',eventId:Number(eventId),id:Number(eventId),day:state.day,hall:state.hall}} viewedVersion={value.publishedAt}/></div><p className="item-meta">로그인 없이 둘러볼 수 있어요. 예매·구매는 공식 안내를 확인하세요.</p>
    </div>{banner&&<figure className="visit-poster"><StoredImage url={banner.url} alt={banner.caption||e.name}/><figcaption>{banner.credit} · <SafeLink url={banner.attribution}>이미지 출처</SafeLink><ReportLink target={{namespace:'CATALOG',type:'ASSET',eventId:Number(eventId),id:banner.id}} label="이미지 문제 신고"/></figcaption></figure>}</header>
    <nav className="visit-task-nav" aria-label="방문 준비 바로가기"><a href="#visit-browse">부스·배치도 찾기 ↓</a><a href="#offline-save">현장용 자료 저장 ↓</a><a href={`/offline/index.html#${eventId}`}>저장 자료 바로 열기 ↗</a></nav>
    <section id="visit-browse" className="visit-controls" aria-label="방문 조건 및 부스 검색"><div className="visit-condition-row">
      <label className="field"><span>방문일</span><select className="select" value={state.day} onChange={ev=>visitChange(ev.target.value)}>{days.map(d=><option key={d} value={d}>{dateLabel(d)}{d===today?' · 오늘':''}</option>)}{!days.length&&<option value="">일정 미확인</option>}</select></label>
      <label className="field"><span>전시관</span><select className="select" value={state.hall} onChange={ev=>{update({hall:ev.target.value,focus:null,booth:null});setMessage('선택한 전시관 기준으로 안내해요.')}}><option value="">전체 전시관</option>{halls.map(h=><option key={h} value={h}>{h}</option>)}{state.hall&&!halls.some(h=>normalizePlace(h)===normalizePlace(state.hall))&&<option value={state.hall}>{state.hall} · 등록 위치 미확인</option>}</select></label>
      <label className="field visit-search"><span>부스·번호·작가·상품 찾기</span><input className="input" type="search" value={state.q} maxLength={100} placeholder="B1, 작가명, 달토끼 키링" onChange={ev=>update({q:ev.target.value,focus:null})}/></label>
    </div><p role="status" className="visit-feedback">{message}</p>
    {params.get('day')&&params.get('day')!==state.day&&<p className="visit-important-note">링크의 날짜는 현재 공개된 운영일이 아니어서 가장 가까운 운영일을 표시합니다.</p>}
    <div className="visit-view-switch" role="group" aria-label="행사 보기 방식">{([['booths','참가 부스'],['map','배치도'],['info','행사 안내']] as const).map(([view,label])=><button key={view} type="button" aria-pressed={state.tab===view} className={state.tab===view?'is-current':''} onClick={()=>update({tab:view})}>{label}</button>)}</div></section>
    {state.booth&&!chosen&&<div className="notice-banner" role="status">이 부스는 현재 공개된 정보에서 찾을 수 없어요. 공개 중지 또는 변경되었을 수 있습니다. <button className="btn secondary" onClick={close}>목록으로</button></div>}
    <div className="memory-mode-switch" role="group" aria-label="내 관심 기준"><span>이 행사에서</span>{([['all','전체 부스'],['saved','저장한 부스'],['visited','방문 표시한 부스']] as const).map(([key,label])=><button type="button" key={key} className="btn secondary" aria-pressed={memoryMode===key} disabled={key!=='all'&&!memoryReady} onClick={()=>{const n=new URLSearchParams(params);if(key==='all')n.delete('my');else n.set('my',key);setParams(n,{replace:true,preventScrollReset:true})}}>{label}</button>)}<Link to={`/library?event=${eventId}`}>이 행사 보관함 →</Link></div>
    {(state.q||state.hall||memoryMode!=='all')&&<div className="visit-active-filters"><span>현재 조건 · {[state.q?`검색: ${state.q}`:'',state.hall,memoryMode==='saved'?'저장한 부스':memoryMode==='visited'?'방문 표시한 부스':''].filter(Boolean).join(' / ')}</span><button type="button" onClick={resetFilters}>조건 해제</button></div>}
    {memoryMode!=='all'&&<p className="item-meta">{memoryMode==='saved'?'상품을 저장한 업체도 함께 보여요. 배치도는 저장한 부스를 강조하며 다른 부스 위치를 바꾸지 않아요.':'선택한 방문일에 직접 표시한 기록만 보여요. QR 스캔은 방문 기록이 아닙니다.'}</p>}
    {memoryBlocked&&state.tab!=='info'&&<div className="visit-memory-state" role={memoryError?'alert':'status'}>
      <h2>{memoryError?'내 관심 목록을 확인하지 못했어요':'내 관심 목록을 확인하고 있어요'}</h2>
      <p>기록을 확인하기 전에는 부스가 없다고 판단하지 않습니다. 공개된 전체 부스는 바로 볼 수 있어요.</p>
      <div className="row-actions"><button className="btn primary" type="button" onClick={resetFilters}>전체 부스 보기</button><Link className="btn secondary" to={`/library?event=${eventId}`}>보관함에서 확인</Link></div>
    </div>}
    <section hidden={state.tab!=='booths'||memoryBlocked} aria-label="참가 부스 목록">
      <div className="visit-list-heading"><h2>소개된 부스 <strong>{list.length}</strong>곳</h2><small>공개된 {value.participants.length}곳 중 현재 조건 · 전체 참가 명단은 아닙니다.</small></div>
      <div className="catalog-booth-grid">{list.map(p=><ParticipantCard key={p.id} eventId={Number(eventId)} row={p} day={state.day} hall={state.hall} assets={value.assets} open={open} showMap={showMap}/>)}</div>
      {!list.length&&<div className="visit-empty"><h3>현재 소개된 부스 중에는 결과가 없어요.</h3><p>미수집·위치 미확인은 실제 미참가를 뜻하지 않아요.</p><div className="row-actions"><button className="btn secondary" onClick={resetFilters}>모든 부스 조건 해제</button><button className="btn secondary" onClick={()=>update({tab:'info'})}>공식 참가 안내 확인</button></div></div>}
    </section>
    {/* Retain mounted map state while a drawer or another view is open. */}
    <div hidden={state.tab!=='map'||memoryBlocked} ref={mapHeading} tabIndex={-1} className="visit-map-section"><InteractiveFloorPlans eventId={eventId} event={e} assets={value.assets} participants={value.participants} day={state.day} hall={state.hall} query={state.q} focusParticipantId={state.focus} onOpen={open} onList={()=>update({tab:'booths'})} onClear={()=>update({q:'',focus:null})} onlySaved={memoryMode!=='all'} savedParticipantIds={memoryReady?[...memoryFilter]:[]}/></div>
    <section hidden={state.tab!=='info'} className="panel visit-info" aria-label="행사 안내"><h2>행사 안내</h2>{e.operationStatus?.sourceUrl&&<details><summary>개최 상태의 확인 근거</summary><p>{e.operationStatus.note}</p><SafeLink url={e.operationStatus.sourceUrl}>상태 공지 원문</SafeLink><small> · {e.operationStatus.checkedOn} 확인</small></details>}<p className="visit-long-copy">{e.description}</p><h3>전체 운영일</h3>{e.occurrences.map((o,i)=><p key={i}>{o.startDate}{o.startDate!==o.endDate?` – ${o.endDate}`:''} · {o.startTime||'시간 미확인'}{o.endTime?` – ${o.endTime}`:''}</p>)}
      {!!e.warnings.length&&<><h3>방문 전 확인사항</h3>{e.warnings.map((w,i)=><p key={i}>{w}</p>)}</>}
      <h3>공식·참고 안내</h3>{e.sources.map((s,i)=><p key={i}><SafeLink url={s.url}>{sourceLabel(s.kind,s.url)}</SafeLink>{s.access!=='ORIGINAL'&&<small> · 원문 직접 확인 필요</small>}</p>)}
      {e.discoveryLinks?.filter(l=>l.url).map((l,i)=><p key={`l${i}`}><SafeLink url={l.url}>{({PARTICIPANTS:'공식 참가 명단',FLOOR_PLAN:'공식 배치도 게시물',SALES:'공식 판매 안내',OFFICIAL:'행사 공식 안내'} as Record<string,string>)[l.kind]||'행사 관련 안내'}</SafeLink>{l.note&&` · ${l.note}`}</p>)}
      <small>공개본 갱신: {new Date(value.publishedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}. 수집 후 변경될 수 있으므로 방문 전 주최 측 최신 공지를 확인하세요.</small>
    </section>
    <OfflineDownloadPanel eventId={Number(eventId)} day={state.day}/>
    {chosen&&<BoothDrawer eventId={Number(eventId)} viewedVersion={value.publishedAt} key={chosen.id} row={chosen} assets={value.assets.filter(a=>a.participantId===chosen.id)} trigger={trigger.current} close={close} day={state.day} hall={state.hall} onMap={()=>showMap(chosen.id)} shareUrl={shareUrl} eventNotice={status.notice}/>}
  </section>
}
function ParticipantCard({eventId,row,day,hall,assets,open,showMap}:{eventId:number;row:PublicParticipant;day:string;hall:string;assets:PublicEvent['assets'];open:(id:number,el:HTMLElement)=>void;showMap:(id:number)=>void}) {
  const thumb=assets.find(a=>a.participantId===row.id&&['BOOTH_CUT','PRODUCT','LOGO'].includes(a.type))
  const locations=relevantLocations(row.participant.locations,day,hall),known=attendance(row,day,hall)
  return <article className={`panel catalog-booth-card visit-booth-card${thumb?' has-image':''}`}>
    {thumb&&<figure><StoredImage url={thumb.url} alt={thumb.caption||row.participant.registrationName}/><figcaption>{thumb.credit} · <SafeLink url={thumb.attribution}>출처</SafeLink></figcaption></figure>}
    <div className="visit-booth-body"><LocationText locations={locations}/><h3>{row.participant.registrationName}</h3><p className="visit-booth-summary">{row.sales?.summary||'판매정보를 확인하고 있어요.'}</p>
      {known==='unknown'&&<small className="visit-warning">선택 날짜·전시관 참가 여부 미확인</small>}
      {row.sales&&<small>{scopes[row.sales.evidenceScope]}</small>}<p className="item-meta">{row.participant.subjects.join(' · ')}</p>
      <div className="row-actions"><SaveButton target={{type:'PARTICIPANT',eventId,id:row.id,participantId:row.id}} day={day} hall={hall} compact/><button className="btn secondary" onClick={()=>showMap(row.id)}>지도에서 보기</button><button className="btn primary" aria-haspopup="dialog" onClick={ev=>open(row.id,ev.currentTarget)}>상품 보기</button></div>
    </div></article>
}
