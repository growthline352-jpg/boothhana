import { ReportLink } from '../support/ReportLink'
import { BoothContent } from '../catalog/BoothContent'
import { eventStatus } from '../visit/eventStatus'
import { seoulToday } from '../discovery/browse'
import { useEffect, useMemo, useState } from 'react'
import { useRemote } from '../../app/useRemote'
import type { EventData, PublicAsset, PublicParticipant } from '../catalog/api'
import { FloorPlans } from '../catalog/FloorPlans'
import { matchesPublicParticipant } from '../catalog/publicSearch'
import { SafeLink } from '../catalog/Shared'
import { defaultDay, normalizePlace, relevantLocations } from '../visit/visit'
import { floorplanApi } from './api'
import type { PlanLink, PublicPlan, PublicShape } from './api'
import { PlanCanvas } from './PlanCanvas'
import { normalizeCode } from './geometry'
const stateText:Record<string,string>={SOURCE_CHANGED:'수정 배치도를 반영하고 있어요. 이전 위치 연결은 잠시 숨겼어요.',PUBLICATION_STALE:'행사·참가자 정보를 갱신하고 있어요.',ROSTER_CHANGED:'참가 명단이 바뀌어 위치를 다시 확인하고 있어요.',SCOPE_CHANGED:'적용 날짜·전시관을 다시 확인하고 있어요.',UNAVAILABLE:'이 배치도는 현재 제공되지 않아요.'}
export function linksForDay(links:PlanLink[],day:string){return day?links.filter(l=>l.dates.includes(day)):[]}
export function planApplies(plan:PublicPlan,day:string,hall:string){return (!day||plan.scope.dates.includes(day))&&(!hall||normalizePlace(plan.scope.hall)===normalizePlace(hall))}
export function InteractiveFloorPlans({eventId,event,assets,participants,onOpen,day:providedDay,hall='',query='',focusParticipantId=null,onList,onClear,onlySaved=false,savedParticipantIds=[]}:{onlySaved?:boolean;savedParticipantIds?:number[];eventId:string;event:EventData;assets:PublicAsset[];participants:PublicParticipant[];onOpen:(id:number,trigger:HTMLElement)=>void;day?:string;hall?:string;query?:string;focusParticipantId?:number|null;onList?:()=>void;onClear?:()=>void}) {
  const day=providedDay??defaultDay(event)
  const state=useRemote(()=>floorplanApi.public(eventId),[eventId]),[chosen,setChosen]=useState('')
  useEffect(()=>{setChosen('')},[focusParticipantId,day,hall])
  const actions=<div className="row-actions">{onList&&<button className="btn secondary" onClick={onList}>참가 부스 목록</button>}{event.sources.find(s=>s.kind==='OFFICIAL')&&<SafeLink url={event.sources.find(s=>s.kind==='OFFICIAL')!.url}>공식 행사 안내</SafeLink>}</div>
  if(state.loading)return <section className="panel"><p role="status">배치도를 확인하고 있어요…</p>{actions}</section>
  if(state.error)return <section className="panel"><h2>배치도를 불러오지 못했어요.</h2><p>부스 목록은 계속 확인할 수 있어요. 이미지 사용 상태를 확인할 수 없어 저장된 도면은 자동으로 대신 표시하지 않습니다.</p><button className="btn secondary" onClick={()=>void state.reload()}>다시 시도</button>{actions}
    <FloorPlans eventId={Number(eventId)} event={event} assets={[]} participants={participants}/></section>
  const data=state.data,eligible=data?.plans.filter(p=>planApplies(p,day,hall))||[]
  const matching=focusParticipantId?eligible.find(p=>p.state==='READY'&&p.shapes.some(s=>linksForDay(s.links,day).some(l=>l.participantId===focusParticipantId))):undefined
  const plan=eligible.find(p=>p.id===chosen)||matching||eligible[0]
  // Never silently show a managed map whose version was withdrawn or superseded.
  const originals=assets.filter(a=>!data?.managedAssetIds.includes(a.id))
  return <><section className="panel floorplan-public" aria-labelledby="floorplan-title"><h2 id="floorplan-title">방문일의 부스 위치 찾기</h2>
    <p className="item-meta">{day||'방문일 미확인'} · {hall||'전체 전시관'}. 위의 방문 조건과 검색어가 목록·배치도에 함께 적용돼요.</p>
    {eligible.length>1&&<label className="field"><span>이 날짜에 적용되는 배치도</span><select className="select" value={plan?.id} onChange={ev=>setChosen(ev.target.value)}>{eligible.map(p=><option key={p.id} value={p.id}>{p.scope.title} · {p.scope.hall||'전시관 미확인'}</option>)}</select></label>}
    {plan?(plan.state==='READY'?<MapView key={plan.id} plan={plan} participants={participants} onOpen={onOpen} day={day} hall={hall} query={query} focusParticipantId={focusParticipantId} onList={onList} onClear={onClear} assets={assets} eventId={eventId} eventNotice={eventStatus(event,seoulToday()).notice} onlySaved={onlySaved} savedParticipantIds={savedParticipantIds}/>:<div role="status"><p>{stateText[plan.state]||'공개 전에 배치도를 확인하고 있어요.'}</p>{plan.state!=='UNAVAILABLE'&&<SafeLink url={plan.sourceUrl}>주최 측 최신 원문 확인</SafeLink>}{actions}</div>):<div className="visit-empty"><h3>이 방문 조건에 맞는 클릭형 배치도가 아직 없어요.</h3><p>미공개·미수집·확인 중일 수 있어요. 배치도가 없다는 뜻은 아닙니다.</p>{actions}</div>}
    {focusParticipantId&&!matching&&<p className="visit-warning" role="status">이 부스의 선택 날짜·전시관 위치를 지도에서 연결하지 못했어요. 번호와 공식 안내를 확인하세요.</p>}
  </section><FloorPlans eventId={Number(eventId)} event={event} assets={originals} participants={participants}/></>
}
export function MapView({plan,participants,onOpen,day:providedDay,hall='',query='',focusParticipantId=null,onList,onClear,assets=[],eventId='',eventNotice,onlySaved=false,savedParticipantIds=[]}:{onlySaved?:boolean;savedParticipantIds?:number[];plan:PublicPlan;participants:PublicParticipant[];onOpen:(id:number,trigger:HTMLElement)=>void;day?:string;hall?:string;query?:string;focusParticipantId?:number|null;onList?:()=>void;onClear?:()=>void;assets?:PublicAsset[];eventId?:string;eventNotice?:string|null}) {
  const day=providedDay||'',q=query,[selected,setSelected]=useState<string|null>(()=>plan.shapes.find(s=>linksForDay(s.links,providedDay||'').some(l=>l.participantId===focusParticipantId))?.id||null),[focusRequest,setFocusRequest]=useState(0)
  const select=(id:string)=>{setSelected(id);setFocusRequest(n=>n+1)}
  const lookup=useMemo(()=>new Map(participants.map(p=>[p.id,p])),[participants])
  const links=(shape:PublicShape)=>linksForDay(shape.links,day).filter(l=>lookup.has(l.participantId))
  const matching=plan.shapes.find(s=>links(s).some(l=>l.participantId===focusParticipantId))
  useEffect(()=>{setSelected(matching?.id||null)},[day,focusParticipantId,matching?.id])
  const matches=plan.shapes.filter(s=>!onlySaved||links(s).some(l=>savedParticipantIds.includes(l.participantId))).filter(s=>!q||normalizeCode(s.label||'').includes(normalizeCode(q))||links(s).some(l=>{
    const p=lookup.get(l.participantId)!;return matchesPublicParticipant({...p,participant:{...p.participant,locations:relevantLocations(p.participant.locations,day,hall)}},q)
  }))
  const current=plan.shapes.find(s=>s.id===selected),currentLinks=current?links(current):[]
  return <>
    {eventId&&<ReportLink target={{namespace:'CATALOG',type:'FLOORPLAN',eventId:Number(eventId),id:null,planId:plan.id,day,hall:plan.scope.hall||hall}} label="배치도 정보 신고" viewedVersion={plan.publishedAt}/>}
    {plan.partial&&<p className="visit-warning">일부 위치·연결은 아직 미확인입니다. 빗금 영역은 연결된 공개 참가정보가 없어요.</p>}
    <PlanCanvas width={plan.width||1} height={plan.height||1} imageUrl={plan.imageUrl} shapes={plan.shapes.map(s=>({...s,recognition:'READABLE',boundaryConfirmed:true}))} selected={selected}
      onSelect={select} focusRequest={focusRequest} highlight={q||onlySaved?matches.map(s=>s.id):[]} linkedIds={plan.shapes.filter(s=>links(s).length).map(s=>s.id)}
      renderSelection={(expanded,showDetails)=>(current&&<div className="floorplan-found" aria-live="polite"><strong>선택 위치 {current.label||'번호 미확인'}</strong>{eventId&&<ReportLink target={{namespace:'CATALOG',type:'FLOORPLAN',eventId:Number(eventId),id:null,planId:plan.id,areaId:current.id,day,hall:plan.scope.hall||hall}} label="위치 오류 신고" viewedVersion={plan.publishedAt}/>}{currentLinks.length?currentLinks.map(l=>{
      const p=lookup.get(l.participantId)!;return <div key={l.participantId}><strong>{p.participant.registrationName}</strong><p>{p.sales?.summary||'판매정보 미확인'}</p><button className="btn primary" data-floorplan-details={p.id} onClick={ev=>{
        if(expanded){
          const search=new URLSearchParams({day,hall,view:'map',booth:String(p.id),focus:String(p.id)})
          const shareUrl=eventId?new URL(`/discover/${eventId}?${search}`,window.location.origin).href:undefined
          showDetails(<BoothContent eventId={Number(eventId)||undefined} viewedVersion={plan.publishedAt} row={p} day={day} hall={hall} assets={assets.filter(a=>a.participantId===p.id)} shareUrl={shareUrl} eventNotice={eventNotice}/>,p.participant.registrationName,ev.currentTarget)
        }else onOpen(p.id,ev.currentTarget)
      }}>상품 보기</button></div>
    }):<><p>이 날짜에 연결된 공개 참가정보가 없습니다. 위치만 확인된 영역이며 참가자를 추측하지 않습니다.</p>{expanded?<small>전체화면을 닫으면 참가 부스 목록에서 계속 찾을 수 있어요.</small>:onList&&<button className="btn secondary" onClick={onList}>참가 부스 목록에서 찾기</button>}</>}</div>)}/>
    <details open={!!q||onlySaved}><summary>{q?'검색한 위치':'부스 위치 목록'} · {matches.length}개 영역</summary><div className="floorplan-search-results">{matches.map(s=>{
      const people=links(s).map(l=>lookup.get(l.participantId)!)
      return <article key={s.id}><div><strong>{s.label||'번호 미확인'} · {people.map(p=>p.participant.registrationName).join(' / ')||'참가자 연결 미확인'}</strong><p>{people.map(p=>p.sales?.summary||p.participant.subjects.join(' · ')).join(' / ')}</p><small>{day} · {plan.scope.hall||'전시관 미확인'}</small></div><div className="row-actions"><button className="btn secondary" onClick={()=>select(s.id)}>위치 보기</button>{people.length===1&&<button className="btn primary" onClick={ev=>onOpen(people[0].id,ev.currentTarget)}>상품 보기</button>}</div></article>
    })}</div>{!matches.length&&<div className="visit-empty"><p>이 도면에서 연결된 부스 중에는 검색 결과가 없어요.</p>{onClear&&<button className="btn secondary" onClick={onClear}>검색어 지우기</button>}{onList&&<button className="btn secondary" onClick={onList}>참가 부스 목록</button>}</div>}</details>
    <p className="item-meta">{plan.credit} · <SafeLink url={plan.sourceUrl}>배치도 원문</SafeLink> · 공개 {new Date(plan.publishedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</p>
  </>
}
