import { ReportLink } from '../support/ReportLink'
import { BoothContent } from '../catalog/BoothContent'
import { eventStatus } from '../visit/eventStatus'
import { seoulToday } from '../discovery/browse'
import { useEffect, useMemo, useState } from 'react'
import { useRemote } from '../../app/useRemote'
import type { EventData, PublicAsset, PublicParticipant } from '../catalog/api'
import { FloorPlans } from '../catalog/FloorPlans'
import { SafeLink } from '../catalog/Shared'
import { defaultDay, normalizePlace } from '../visit/visit'
import { floorplanApi } from './api'
import type { PlanLink, PublicPlan, PublicShape } from './api'
import { PlanCanvas } from './PlanCanvas'
import { generateSchematicPlan } from './schematic'
import { matchesFloorplanSearch } from './mapSearch'
const stateText:Record<string,string>={SOURCE_CHANGED:'수정 배치도를 반영하고 있어요. 이전 위치 연결은 잠시 숨겼어요.',PUBLICATION_STALE:'행사·참가자 정보를 갱신하고 있어요.',ROSTER_CHANGED:'참가 명단이 바뀌어 위치를 다시 확인하고 있어요.',SCOPE_CHANGED:'적용 날짜·전시관을 다시 확인하고 있어요.',UNAVAILABLE:'이 배치도는 현재 제공되지 않아요.'}
export function linksForDay(links:PlanLink[],day:string){return day?links.filter(l=>l.dates.includes(day)):[]}
export function planApplies(plan:PublicPlan,day:string,hall:string,participants:PublicParticipant[]=[]){
  if(day&&!plan.scope.dates.includes(day))return false
  if(!hall)return true
  if(plan.scope.hall)return normalizePlace(plan.scope.hall)===normalizePlace(hall)
  // A single floorplan can cover multiple halls. Use its linked booths instead
  // of treating an empty single-hall scope as "hall unknown".
  const hallParticipants=new Set(participants.filter(p=>p.participant.locations.some(l=>normalizePlace(l.hall)===normalizePlace(hall))).map(p=>p.id))
  return plan.shapes.some(shape=>shape.links.some(link=>hallParticipants.has(link.participantId)&&(!day||link.dates.includes(day))))
}
export function InteractiveFloorPlans({eventId,event,assets,participants,onOpen,day:providedDay,hall='',query='',focusParticipantId=null,onList,onClear,onlySaved=false,savedParticipantIds=[]}:{onlySaved?:boolean;savedParticipantIds?:number[];eventId:string;event:EventData;assets:PublicAsset[];participants:PublicParticipant[];onOpen:(id:number,trigger:HTMLElement)=>void;day?:string;hall?:string;query?:string;focusParticipantId?:number|null;onList?:()=>void;onClear?:()=>void}) {
  const day=providedDay??defaultDay(event)
  const state=useRemote(()=>floorplanApi.public(eventId),[eventId]),[chosen,setChosen]=useState('')
  useEffect(()=>{setChosen('')},[focusParticipantId,day,hall])
  const floorplanLinks=event.discoveryLinks?.filter(link=>link.kind==='FLOOR_PLAN'&&link.url)||[]
  const officialUrl=event.discoveryLinks?.find(link=>link.kind==='OFFICIAL'&&link.url)?.url
    || event.sources.find(source=>source.kind==='OFFICIAL')?.url
    || event.sources[0]?.url
    || ''
  const actions=<div className="row-actions">{onList&&<button className="btn secondary" onClick={onList}>참가 부스 목록</button>}{floorplanLinks.map((link,index)=><SafeLink key={`${link.url??'floorplan'}-${index}`} url={link.url}>공식 배치도{floorplanLinks.length>1?` ${index+1}`:''} 열기 ↗</SafeLink>)}{officialUrl&&<SafeLink url={officialUrl}>공식 행사 안내</SafeLink>}</div>
  if(state.loading)return <section className="panel"><p role="status">배치도를 확인하고 있어요…</p>{actions}</section>
  if(state.error)return <section className="panel"><h2>배치도를 불러오지 못했어요.</h2><p>부스 목록은 계속 확인할 수 있어요. 이미지 사용 상태를 확인할 수 없어 저장된 도면은 자동으로 대신 표시하지 않습니다.</p><button className="btn secondary" onClick={()=>void state.reload()}>다시 시도</button>{actions}
    <FloorPlans eventId={Number(eventId)} event={event} assets={[]} participants={participants}/></section>
  const data=state.data,eligible=data?.plans.filter(p=>planApplies(p,day,hall,participants))||[]
  const sourceUrl=floorplanLinks[0]?.url||officialUrl
  const schematic=generateSchematicPlan(event,participants,day,hall,sourceUrl)
  const ready=eligible.filter(p=>p.state==='READY').sort((a,b)=>a.scope.title.localeCompare(b.scope.title,'ko'))
  const matching=focusParticipantId?[...ready,...(schematic?[schematic]:[])].find(p=>p.shapes.some(s=>linksForDay(s.links,day).some(l=>l.participantId===focusParticipantId))):undefined
  const plan=ready.find(p=>p.id===chosen)||matching||ready[0]||schematic||eligible[0]
  // Never silently show a managed map whose version was withdrawn or superseded.
  const originals=assets.filter(a=>!data?.managedAssetIds.includes(a.id))
  const uncoveredEvent={...event,discoveryLinks:event.discoveryLinks?.filter(link=>link.kind!=='FLOOR_PLAN'||!ready.some(p=>p.sourceUrl===link.url))}
  return <><section className="panel floorplan-public" aria-labelledby="floorplan-title"><h2 id="floorplan-title">방문일의 부스 위치 찾기</h2>
    <p className="item-meta">{day||'방문일 미확인'} · {hall||'전체 전시관'}. 위의 방문 조건과 검색어가 목록·배치도에 함께 적용돼요.</p>
    {ready.length>1&&<label className="field"><span>이 날짜에 적용되는 배치도</span><select className="select" value={plan?.id} onChange={ev=>setChosen(ev.target.value)}>{ready.map(p=><option key={p.id} value={p.id}>{p.scope.title}{p.scope.hall&&p.scope.hall!==p.scope.title?` · ${p.scope.hall}`:''}</option>)}</select></label>}
    {plan?(plan.state==='READY'?<MapView key={plan.id} plan={plan} participants={participants} onOpen={onOpen} day={day} hall={hall} query={query} focusParticipantId={focusParticipantId} onList={onList} onClear={onClear} assets={assets} eventId={eventId} eventNotice={eventStatus(event,seoulToday()).notice} onlySaved={onlySaved} savedParticipantIds={savedParticipantIds}/>:<div role="status"><p>{stateText[plan.state]||'공개 전에 배치도를 확인하고 있어요.'}</p>{plan.state!=='UNAVAILABLE'&&<SafeLink url={plan.sourceUrl}>주최 측 최신 원문 확인</SafeLink>}{actions}</div>):<div className="visit-empty"><h3>{floorplanLinks.length?'클릭형 배치도는 준비 중이에요.':'이 방문 조건에 맞는 클릭형 배치도가 아직 없어요.'}</h3><p>{floorplanLinks.length?'현재는 주최 측이 공개한 공식 배치도에서 부스 위치를 확인할 수 있어요.':'미공개·미수집·확인 중일 수 있어요. 배치도가 없다는 뜻은 아닙니다.'}</p>{actions}</div>}
    {focusParticipantId&&!matching&&<p className="visit-warning" role="status">이 부스의 선택 날짜·전시관 위치를 지도에서 연결하지 못했어요. 번호와 공식 안내를 확인하세요.</p>}
  </section><FloorPlans eventId={Number(eventId)} event={uncoveredEvent} assets={originals} participants={participants}/></>
}
export function MapView({plan,participants,onOpen,day:providedDay,hall='',query='',focusParticipantId=null,onList,onClear,assets=[],eventId='',eventNotice,onlySaved=false,savedParticipantIds=[]}:{onlySaved?:boolean;savedParticipantIds?:number[];plan:PublicPlan;participants:PublicParticipant[];onOpen:(id:number,trigger:HTMLElement)=>void;day?:string;hall?:string;query?:string;focusParticipantId?:number|null;onList?:()=>void;onClear?:()=>void;assets?:PublicAsset[];eventId?:string;eventNotice?:string|null}) {
  const day=providedDay||'',[mapQuery,setMapQuery]=useState(query),[selected,setSelected]=useState<string|null>(()=>plan.shapes.find(s=>linksForDay(s.links,providedDay||'').some(l=>l.participantId===focusParticipantId))?.id||null),[focusRequest,setFocusRequest]=useState(0)
  const select=(id:string)=>{setSelected(id);setFocusRequest(n=>n+1)}
  const lookup=useMemo(()=>new Map(participants.map(p=>[p.id,p])),[participants])
  const links=(shape:PublicShape)=>linksForDay(shape.links,day).filter(l=>lookup.has(l.participantId))
  const matching=plan.shapes.find(s=>links(s).some(l=>l.participantId===focusParticipantId))
  useEffect(()=>{setSelected(matching?.id||null)},[day,focusParticipantId,matching?.id])
  useEffect(()=>{setMapQuery(query)},[query])
  const matches=plan.shapes.filter(s=>!onlySaved||links(s).some(l=>savedParticipantIds.includes(l.participantId))).filter(s=>matchesFloorplanSearch(s.label,links(s).map(l=>lookup.get(l.participantId)!),mapQuery,day,hall))
  const current=plan.shapes.find(s=>s.id===selected),currentLinks=current?links(current):[]
  return <>
    {eventId&&<ReportLink target={{namespace:'CATALOG',type:'FLOORPLAN',eventId:Number(eventId),id:null,planId:plan.id,day,hall:plan.scope.hall||hall}} label="배치도 정보 신고" viewedVersion={plan.publishedAt}/>}
    {plan.schematic?<p className="visit-warning">현재 공개된 부스번호{plan.shapes.some(s=>(s.kind||'BOOTH')!=='BOOTH')?'와 원본에 표시된 편의시설을':'를'} 자동 정리한 안내도예요. 실제 통로·거리와 표시되지 않은 시설은 공식 배치도에서 확인하세요.</p>:plan.partial&&<p className="visit-warning">일부 위치·연결은 아직 미확인입니다. 빗금 영역은 연결된 공개 참가정보가 없어요.</p>}
    <form className="floorplan-map-search" onSubmit={event=>{event.preventDefault();if(matches[0])select(matches[0].id)}}>
      <label htmlFor={`floorplan-search-${plan.id}`}>배치도에서 부스 찾기</label>
      <div><input id={`floorplan-search-${plan.id}`} className="input" type="search" value={mapQuery} onChange={event=>setMapQuery(event.target.value)} placeholder="부스번호·부스명·시설 · 예: D-25A, 화장실"/><button className="btn primary" type="submit" disabled={!matches.length}>첫 위치 보기</button>{mapQuery&&<button className="btn subtle" type="button" onClick={()=>setMapQuery('')}>지우기</button>}</div>
      {mapQuery&&<p role="status"><strong>{matches.length}개</strong> 위치를 찾았습니다.{matches.length?' 첫 결과를 바로 선택할 수 있어요.':' 다른 부스번호나 이름으로 검색해 보세요.'}</p>}
    </form>
    <PlanCanvas width={plan.width||1} height={plan.height||1} imageUrl={plan.imageUrl} shapes={plan.shapes.map(s=>({...s,recognition:'READABLE',boundaryConfirmed:true}))} selected={selected}
      onSelect={select} focusRequest={focusRequest} highlight={mapQuery||onlySaved?matches.map(s=>s.id):[]} linkedIds={plan.shapes.filter(s=>(s.kind||'BOOTH')!=='BOOTH'||links(s).length).map(s=>s.id)}
      renderSelection={(expanded,showDetails)=>(current&&<div className="floorplan-found" aria-live="polite"><div className="floorplan-found-heading"><span>{(current.kind||'BOOTH')==='BOOTH'?'선택한 위치':'선택한 시설'}</span><strong>{current.label||((current.kind||'BOOTH')==='BOOTH'?'번호 미확인':'시설')}</strong>{eventId&&<ReportLink target={{namespace:'CATALOG',type:'FLOORPLAN',eventId:Number(eventId),id:null,planId:plan.id,areaId:current.id,day,hall:plan.scope.hall||hall}} label="위치 오류 신고" viewedVersion={plan.publishedAt}/>}</div>{(current.kind||'BOOTH')!=='BOOTH'?<div className="floorplan-facility-detail"><strong>원본 배치도 시설 안내</strong><p>주최 측 원본에 표시된 위치입니다. 현장 동선과 운영 여부는 행사 안내를 함께 확인해 주세요.</p></div>:currentLinks.length?currentLinks.map(l=>{
      const p=lookup.get(l.participantId)!;return <div key={l.participantId}><strong>{p.participant.registrationName}</strong><p>{p.sales?.summary||'판매정보 미확인'}</p><button className="btn primary" data-floorplan-details={p.id} onClick={ev=>{
        if(expanded){
          const search=new URLSearchParams({day,hall,view:'map',booth:String(p.id),focus:String(p.id)})
          const shareUrl=eventId?new URL(`/discover/${eventId}?${search}`,window.location.origin).href:undefined
          showDetails(<BoothContent eventId={Number(eventId)||undefined} viewedVersion={plan.publishedAt} row={p} day={day} hall={hall} assets={assets.filter(a=>a.participantId===p.id)} shareUrl={shareUrl} eventNotice={eventNotice}/>,p.participant.registrationName,ev.currentTarget)
        }else onOpen(p.id,ev.currentTarget)
      }}>부스 정보 보기</button></div>
    }):<div className="floorplan-empty-location"><strong>등록된 부스 정보가 없습니다.</strong><p>현재는 위치번호만 제공해요. 참가 정보가 들어오면 이 위치에 자동으로 연결됩니다.</p>{expanded?<small>전체화면을 닫으면 참가 부스 목록에서 계속 찾을 수 있어요.</small>:onList&&<button className="btn secondary" onClick={onList}>참가 부스 목록에서 찾기</button>}</div>}</div>)}/>
    <details open={!!mapQuery||onlySaved}><summary>{mapQuery?'검색한 위치':'부스·시설 위치 목록'} · {matches.length}개 영역</summary><div className="floorplan-search-results">{matches.map(s=>{
      const people=links(s).map(l=>lookup.get(l.participantId)!)
      const facility=(s.kind||'BOOTH')!=='BOOTH'
      return <article key={s.id}><div><strong>{s.label||(facility?'시설':'번호 미확인')} · {facility?'편의시설':people.map(p=>p.participant.registrationName).join(' / ')||'참가자 연결 미확인'}</strong><p>{facility?'주최 측 원본에 표시된 시설 위치':people.map(p=>p.sales?.summary||p.participant.subjects.join(' · ')).join(' / ')}</p><small>{day} · {plan.scope.hall||plan.scope.title}</small></div><div className="row-actions"><button className="btn secondary" onClick={()=>select(s.id)}>위치 보기</button>{!facility&&people.length===1&&<button className="btn primary" onClick={ev=>onOpen(people[0].id,ev.currentTarget)}>부스 상세</button>}</div></article>
    })}</div>{!matches.length&&<div className="visit-empty"><p>이 도면에서 연결된 부스 중에는 검색 결과가 없어요.</p>{onClear&&<button className="btn secondary" onClick={onClear}>검색어 지우기</button>}{onList&&<button className="btn secondary" onClick={onList}>참가 부스 목록</button>}</div>}</details>
    <p className="item-meta">{plan.credit} · <SafeLink url={plan.sourceUrl}>배치도 원문</SafeLink>{!plan.schematic&&<> · 공개 {new Date(plan.publishedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</>}</p>
  </>
}
