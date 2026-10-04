import {useEffect,useId,useMemo,useRef,useState,type ReactNode} from 'react'
import {Link,useSearchParams} from 'react-router'
import {useAuth} from '../../app/useAuth'
import {useRemote} from '../../app/useRemote'
import {publicCatalogApi,type PublicEventSummary} from '../catalog/api'
import {publicRead} from '../../api/client'
import {ContentImage} from '../../components/ui/ContentImage'
import {DiscoveryIcon} from '../discovery/DiscoveryIcon'
import {categories,categoryForType} from '../discovery/categories'
import {seoulToday} from '../discovery/browse'
import {defaultDay,validDay} from '../visit/visit'
import {openCatalogDialog} from '../catalog/dialogLifecycle'
import {ItineraryMap} from './ItineraryMap'
import {ItineraryStop} from './ItineraryStop'
import {TopicPicker} from './TopicPicker'
import {ShareDialog} from './ShareDialog'
import {emptyTopics,matchesTopics,upcomingMatches} from './topics'
import {areas,distance,eventStop,kindNames,moveStop,nextStart,operatingOn,planCalendar,planIssueDetails,planIssues,readPlans,recommendedEvents,savedPlanSignature,timeMinutes,validPoint,writePlan,type Plan,type PlanStop,type Point,type Purpose,type StopKind} from './model'
import {nearbyAvailable,nearbyPlaces,placeSearchAvailable,placeStop,resolveAddress,searchPlaces,type Place} from './places'
import {eventArea,eventLocationMessage,manualPlaceStop,planNearbyCenter,resolveEventLocation} from './recommendation'
import './itinerary.css'

const initialPlan=(purpose:Purpose='DATE'):Plan=>({version:1,id:crypto.randomUUID(),title:'',purpose,day:seoulToday(),start:purpose==='DATE'?'13:00':'10:00',end:'19:00',area:'SEONGSU',style:purpose==='DATE'?'CONTENT':'VIEW',stops:[],updatedAt:new Date().toISOString()})
type AddMode='EVENT'|'PLACES'|'MANUAL'|'LOCATE'
interface PopupData {places:{event_id:number;address:string;latitude:number|null;longitude:number|null}[]}
export function ItineraryPage(){
 const [params,setParams]=useSearchParams(),auth=useAuth(),owner=auth.status==='authenticated'&&auth.user?`member:${auth.user.id}`:auth.status==='anonymous'?'guest':''
 const storageKey=`boothhana.itineraries.v1:${owner}`,draftKey=`${storageKey}:draft`
 const [plan,setPlan]=useState<Plan>(()=>initialPlan()),[step,setStep]=useState(0),[selected,setSelected]=useState(''),[view,setView]=useState('list')
 const [editingId,setEditingId]=useState('')
 const [shareOpen,setShareOpen]=useState(false)
 const heading=useRef<HTMLHeadingElement>(null)
 const [saved,setSaved]=useState<Plan[]>([]),[draft,setDraft]=useState<Plan|null>(null),[savedSignature,setSavedSignature]=useState('')
 const [anchor,setAnchor]=useState<PublicEventSummary|null>(null),[field,setField]=useState('SUBCULTURE'),[eventQuery,setEventQuery]=useState(''),[anchorTime,setAnchorTime]=useState('10:00')
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[places,setPlaces]=useState<Place[]>([]),[placeError,setPlaceError]=useState('')
 const [addMode,setAddMode]=useState<AddMode|null>(null),[replaceId,setReplaceId]=useState(''),[locationId,setLocationId]=useState(''),[resetOpen,setResetOpen]=useState(false)
 const scope=useRef(''),job=useRef(0),ownerRef=useRef(owner);ownerRef.current=owner
 const requestedEvent=params.get('event')||'',requestedDay=params.get('day')||''
 const requestedPlan=params.get('plan')||''
 const area=areas.find(a=>a.id===plan.area)||areas[0]
 const nearbyCenter=planNearbyCenter(plan,area.point),center=nearbyCenter||area.point
 const data=useRemote(async()=>{
  if(!validDay(plan.day))return []
  const result=await Promise.allSettled(categories.map(c=>publicCatalogApi.calendar(new URLSearchParams({category:c.code,from:plan.day,to:plan.day,sort:'DATE_ASC'}).toString())))
  if(result.some(r=>r.status==='rejected'))throw new Error('행사 목록을 모두 확인하지 못했어요. 다시 불러와 주세요.')
  return result.flatMap(r=>r.status==='fulfilled'?r.value:[])
 },[plan.day])
 const rows=useMemo(()=>data.data||[],[data.data])
 const topicData=useRemote(async()=>{
  if(step!==1||plan.purpose!=='EVENT'||field!=='SUBCULTURE')return []
  const from=seoulToday(),date=new Date(`${from}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+90)
  return publicCatalogApi.calendar(new URLSearchParams({category:'SUBCULTURE',from,to:date.toISOString().slice(0,10),sort:'DATE_ASC'}).toString())
 },[step===1,plan.purpose,field])
 const popup=useRemote(()=>validDay(plan.day)?publicRead<PopupData>(`/api/public/catalog/popups?from=${plan.day}&to=${plan.day}`).catch(()=>({places:[]})):Promise.resolve({places:[]}),[plan.day])
 const pointFor=(row:PublicEventSummary):Point|null=>{const p=popup.data?.places.find(p=>p.event_id===row.id&&p.address===row.event.address),point=p?{lat:p.latitude,lng:p.longitude}:null;return validPoint(point)?point:null}
 const resolvedAnchor=useMemo(()=>{
  if(!anchor)return null
  for(const row of rows){const place=operatingOn(row,plan.day).find(p=>p.eventId===anchor.id);if(place)return {...anchor,event:{...anchor.event,address:anchor.event.address||place.event.address,venueName:anchor.event.venueName||place.event.venueName}}}
  return anchor
 },[anchor,rows,plan.day])
 const recommendationAnchor=useMemo(()=>{
  if(resolvedAnchor)return resolvedAnchor
  const main=plan.stops.find(s=>s.kind==='EVENT'&&s.locked)||plan.stops.find(s=>s.kind==='EVENT')
  if(!main?.eventId)return undefined
  for(const row of rows){const place=operatingOn(row,plan.day).find(p=>p.eventId===main.eventId);if(place)return {...row,id:place.eventId,event:place.event,operatingPlaces:undefined}}
  return undefined
 },[resolvedAnchor,rows,plan.stops,plan.day])
 const recommendationArea=plan.purpose==='EVENT'?eventArea(recommendationAnchor?.event.address,recommendationAnchor?.event.venueName):plan.area
 const candidates=useMemo(()=>plan.purpose==='EVENT'&&(!recommendationAnchor||!recommendationArea)?[]:recommendedEvents(rows,plan.day,recommendationArea,recommendationAnchor||undefined,plan.purpose,[],plan.interests),[rows,plan.day,recommendationArea,plan.purpose,recommendationAnchor,plan.interests])
 const visiblePlaces=(nearbyCenter?places:[]).map(p=>({...p,distance:distance(center,p.point)})).filter(p=>p.distance<=1.2).sort((a,b)=>a.distance-b.distance)
 const anchorRows=rows.flatMap(row=>operatingOn(row,plan.day).map(p=>({...row,id:p.eventId,event:p.event,operatingPlaces:undefined}))).filter((row,i,all)=>all.findIndex(r=>r.id===row.id)===i).filter(row=>categoryForType(row.event.subcategory).code===field&&row.event.name.toLocaleLowerCase().includes(eventQuery.toLocaleLowerCase())&&(field!=='SUBCULTURE'||matchesTopics(row,plan.interests)))
 const nextMatches=field==='SUBCULTURE'&&!anchorRows.length?upcomingMatches(topicData.data||[],plan.interests||emptyTopics(),plan.day).filter(x=>x.row.event.name.toLocaleLowerCase().includes(eventQuery.toLocaleLowerCase())).slice(0,3):[]
 const signature=JSON.stringify(plan),dirty=step===2&&signature!==savedSignature
 const issueDetails=planIssueDetails(plan),issues=planIssues(plan),focused=plan.stops.find(s=>s.id===selected)
 useEffect(()=>{setEditingId('');const frame=requestAnimationFrame(()=>{window.scrollTo({top:0,behavior:'auto'});heading.current?.focus({preventScroll:true})});return()=>cancelAnimationFrame(frame)},[step])
 useEffect(()=>{
  if(!owner){setShareOpen(false);scope.current='';job.current++;setBusy(false);setAddMode(null);setSaved([]);setDraft(null);setPlan(initialPlan());setStep(0);setSelected('');return}
  if(scope.current===storageKey)return
  setShareOpen(false);scope.current=storageKey;job.current++;setBusy(false);setPlaces([]);setAddMode(null);setAnchor(null);setSavedSignature('');setPlan(initialPlan());setStep(0)
  setSaved(readPlans(localStorage,storageKey));setDraft(readPlans(sessionStorage,draftKey)[0]||null)
 },[owner,storageKey,draftKey])
 useEffect(()=>{
  if(!owner||!requestedPlan||scope.current!==storageKey)return
  const p=readPlans(localStorage,storageKey).find(p=>p.id===requestedPlan)
  if(p){setPlan(p);setAnchor(null);setStep(2);setSelected(p.stops[0]?.id||'');setSavedSignature(JSON.stringify(p));setParams({}, {replace:true})}
 },[owner,requestedPlan,storageKey,setParams])
 useEffect(()=>{
  if(!owner||!/^[1-9]\d*$/.test(requestedEvent))return
  let active=true
   void publicCatalogApi.event(requestedEvent).then(row=>{if(!active)return;const day=defaultDay(row.event,requestedDay);setAnchor({...row,participantCount:row.participants.length});setField(categoryForType(row.event.subcategory).code);const start=row.event.occurrences.find(o=>o.startDate<=day&&o.endDate>=day)?.startTime?.slice(0,5)||'10:00';setAnchorTime(start);setPlan({...initialPlan('EVENT'),day:day||seoulToday(),area:eventArea(row.event.address,row.event.venueName)});setStep(1)}).catch(()=>{if(active)setMessage('중심 행사를 불러오지 못했어요. 목록에서 다시 골라 주세요.')})
  return()=>{active=false}
 },[requestedEvent,requestedDay,owner])
 useEffect(()=>{
  if(!owner||step!==2||!plan.stops.length||scope.current!==storageKey||JSON.stringify(plan)===savedSignature)return
  try{writePlan(sessionStorage,draftKey,plan)}catch{ /* Explicit save reports storage failures; drafts are optional. */ }
 },[plan,step,owner,storageKey,draftKey,savedSignature])
 const patch=(change:Partial<Plan>)=>{setPlan(p=>({...p,...change}));setMessage('')}
 const editStop=(id:string,change:Partial<PlanStop>)=>{setPlan(p=>({...p,stops:p.stops.map(s=>s.id===id?{...s,...change}:s)}));setMessage('')}
 const newPlan=()=>{job.current++;setBusy(false);setPlan(initialPlan());setAnchor(null);setStep(0);setSelected('');setEditingId('');setView('list');setSavedSignature('');setPlaces([]);setPlaceError('');setMessage('');setDraft(null);setParams({}, {replace:true});try{sessionStorage.removeItem(draftKey)}catch{/* optional */}}
 const restore=(p:Plan)=>{job.current++;setBusy(false);setPlaces([]);setPlaceError('');setAddMode(null);setPlan(p);setAnchor(null);setStep(2);setSelected(p.stops[0]?.id||'');setEditingId('');setView('list');setSavedSignature(savedPlanSignature(saved,p.id));setMessage('');setParams({}, {replace:true})}
 const addStop=(stop:PlanStop)=>{
  if(replaceId){const old=plan.stops.find(s=>s.id===replaceId);if(old?.locked){setMessage('고정한 장소는 먼저 고정을 해제해 주세요.');return}setPlan(p=>({...p,stops:p.stops.map(s=>s.id===replaceId?{...stop,start:s.start,duration:s.duration}:s)}))}
  else{if(plan.stops.length>=20){setMessage('한 일정에는 최대 20곳까지 추가할 수 있어요.');return}if(stop.source==='MANUAL')stop={...stop,start:nextStart(plan,stop.duration)||plan.start};setPlan(p=>({...p,stops:[...p.stops,stop]}))}
  setSelected(stop.id);setEditingId(stop.id);setView('list');setAddMode(null);setReplaceId('');setMessage(replaceId?'장소를 바꿨어요. 기존 방문 시간은 유지했어요.':'장소를 추가했어요. 방문 시간을 확인해 주세요.')
 }
 const insertEvent=(row:PublicEventSummary)=>{if(!replaceId&&plan.stops.some(s=>s.eventId===row.id)){setMessage('이미 일정에 있는 행사예요.');return}const time=nextStart(plan,60)||plan.start;addStop(eventStop(row,plan.day,time,pointFor(row)))}
 const insertPlace=(place:Place)=>{if(!nearbyCenter){setPlaceError(eventLocationMessage);return}const duration=place.kind==='FOOD'?60:45;addStop(placeStop(place,nextStart(plan,duration)||plan.start))}
 const loadNearby=async()=>{if(!nearbyCenter){setPlaces([]);setPlaceError(eventLocationMessage);return}const token=++job.current,currentOwner=owner;setBusy(true);setPlaceError('');try{const result=await nearbyPlaces(nearbyCenter);if(token===job.current&&currentOwner===ownerRef.current)setPlaces(result)}catch(e){if(token===job.current)setPlaceError(e instanceof Error?e.message:'장소를 확인하지 못했어요.')}finally{if(token===job.current)setBusy(false)}}
 const generate=async()=>{
  if(!owner||!validDay(plan.day)||timeMinutes(plan.end)<=timeMinutes(plan.start)||(plan.purpose==='EVENT'&&!anchor))return
  const token=++job.current,currentOwner=owner;setBusy(true);setMessage('');setPlaceError('');setPlaces([])
  const next={...plan,title:plan.title||(plan.purpose==='DATE'?`${area.name} 데이트`:anchor!.event.name+' 방문'),stops:[] as PlanStop[]}
  const suggestions=[...candidates].sort((a,b)=>{
   const preferred=(r:PublicEventSummary)=>['POPUP','EXHIBITION'].includes(categoryForType(r.event.subcategory).code)?1:0
   return plan.purpose==='DATE'?preferred(b.row)-preferred(a.row):0
  })
  const main=plan.purpose==='EVENT'?resolvedAnchor:suggestions.find(c=>{
   const stop=eventStop(c.row,plan.day,plan.start);stop.duration=Math.min(stop.duration,plan.style==='WALK'?60:90)
   return !planIssues({...next,stops:[stop]}).length
  })?.row
  const mainPoint=main&&plan.purpose==='EVENT'?await resolveEventLocation(main.event.address,pointFor(main),resolveAddress):main?pointFor(main):null
  if(token!==job.current||currentOwner!==ownerRef.current)return
  const buildMain=(start:string)=>{if(!main)return null;const stop=eventStop(main,plan.day,start,mainPoint);if(plan.purpose==='EVENT'){stop.start=anchorTime;stop.locked=true;if(plan.style==='GOODS'&&stop.duration>=180)stop.duration=240}else stop.duration=Math.min(stop.duration,plan.style==='WALK'?60:90);return stop}
  const initialMain=buildMain(plan.start)
  if(initialMain&&!(plan.purpose==='DATE'&&plan.style==='RELAXED'))next.stops.push(initialMain)
  try{const searchCenter=planNearbyCenter(next,area.point);if(!searchCenter)throw new Error(eventLocationMessage);const nearby=await nearbyPlaces(searchCenter);if(token!==job.current||currentOwner!==ownerRef.current)return;setPlaces(nearby)
   const food=nearby.find(p=>p.kind==='FOOD'),cafe=nearby.find(p=>p.kind==='CAFE')
   if(food){const start=nextStart(next,60);if(start)next.stops.push(placeStop(food,start))}
   if(plan.purpose==='DATE'&&plan.style==='RELAXED'&&main){const start=nextStart(next,90),stop=start?buildMain(start):null;if(stop&&!planIssues({...next,stops:[...next.stops,stop]}).length)next.stops.push(stop)}
   if(cafe){const start=nextStart(next,45);if(start)next.stops.push(placeStop(cafe,start))}
  }catch(e){if(token===job.current)setPlaceError(e instanceof Error?e.message:'주변 장소를 확인하지 못했어요.')}
  if(token!==job.current||currentOwner!==ownerRef.current)return
  if(!next.stops.length&&initialMain)next.stops.push(initialMain)
  setPlan(next);setSelected(next.stops[0]?.id||'');setStep(2);setBusy(false);setSavedSignature('');window.scrollTo({top:0,behavior:'auto'})
 }
 const save=()=>{if(!owner||!plan.stops.length)return;try{const next={...plan,title:plan.title.trim()||'나의 하루 일정',updatedAt:new Date().toISOString()};writePlan(localStorage,storageKey,next);setPlan(next);setSaved(readPlans(localStorage,storageKey));setSavedSignature(JSON.stringify(next));sessionStorage.removeItem(draftKey);setDraft(null);setMessage('이 브라우저에 저장했어요. 내 일정에서 다시 수정할 수 있어요.')}catch{setMessage('저장 공간을 확인해 주세요. 캘린더 파일로도 내보낼 수 있어요.')}}
 const download=()=>{try{const content=planCalendar(plan),url=URL.createObjectURL(new Blob([content],{type:'text/calendar;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`boothhana-plan-${plan.day}.ics`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setMessage('캘린더 파일을 내려받았어요. 변경 후에는 다시 내려받아 주세요.')}catch{setMessage('표시된 시간 문제를 수정한 뒤 캘린더에 추가해 주세요.')}}
 const edit=(id:string)=>{setSelected(id);setEditingId(id);setView('list');requestAnimationFrame(()=>{const row=document.getElementById(`stop-${id}`);row?.scrollIntoView({block:'nearest',behavior:'auto'});row?.querySelector<HTMLElement>('.it-lock-note button,.it-stop-edit input:not(:disabled)')?.focus({preventScroll:true})})}
 const replace=(stop:PlanStop)=>{setReplaceId(stop.id);setLocationId('');setAddMode(stop.kind==='EVENT'?'EVENT':stop.source==='MANUAL'?'MANUAL':'PLACES')}
 const beginAdd=(mode:AddMode)=>{setReplaceId('');setLocationId('');setAddMode(mode);setMessage('')}
 const locate=(id:string)=>{setLocationId(id);setReplaceId('');setAddMode('LOCATE')}
 const requestNew=()=>dirty?setResetOpen(true):newPlan()
 return <section className={`it-page${step===2?' is-editing':''}`}>
  <header className="it-heading">
   <div><h1 ref={heading} tabIndex={-1}>{step===2?'나의 하루 일정':'일정 만들기'}</h1><p>{step===2?'전체 코스를 확인하고, 필요한 장소만 눌러 수정하세요.':'행사를 중심으로, 또는 함께 보낼 하루를 계획하세요.'}</p></div>
   <div className="it-heading-actions">{step===2&&<button className="btn secondary" onClick={requestNew}>새 일정</button>}<Link className="it-back" to="/library">내 보관함 <DiscoveryIcon name="arrow" size={15}/></Link></div>
  </header>
  {step<2&&<ol className="it-progress" aria-label="일정 만들기 단계">{['목적 선택','날짜·장소','코스 완성'].map((label,i)=><li key={label} className={i===step?'current':i<step?'done':''} aria-current={i===step?'step':undefined}><span>{i<step?<DiscoveryIcon name="check" size={13}/>:i+1}</span>{label}</li>)}</ol>}
  {message&&<p className={`it-message${/못|저장 공간/.test(message)?' is-error':''}`} role={/못|저장 공간/.test(message)?'alert':'status'}>{message}</p>}
  {!owner?<p role="status">계정 상태를 확인하고 있어요.{auth.status==='error'&&<button className="btn secondary" onClick={()=>void auth.refresh()}>다시 확인</button>}</p>:step===0?<>
   <h2 className="it-purpose-heading">어떤 일정으로 시작할까요?</h2>
   <div className="it-purpose-grid">
    <PurposeCard icon="ticket" title="행사 참여" text="가려는 행사부터 고르고, 근처 식사와 카페를 더해요." action="행사 선택하기" onClick={()=>{patch({purpose:'EVENT',start:'10:00',style:'VIEW'});setStep(1)}}/>
    <PurposeCard icon="sparkles" title="데이트" text="날짜와 동네를 고르면 행사·식사·카페 코스를 만들어요." action="날짜·동네 정하기" onClick={()=>{patch({purpose:'DATE',start:'13:00',style:'CONTENT',interests:undefined});setStep(1)}}/>
   </div>
   {draft&&<div className="it-resume"><div><strong>이어서 만들기</strong><p>{draft.title||'작성 중인 일정'} · {draft.day}</p></div><button className="btn secondary" onClick={()=>restore(draft)}>일정 열기</button></div>}
   <SavedPlans rows={saved} open={restore} remove={id=>{try{const next=saved.filter(p=>p.id!==id);localStorage.setItem(storageKey,JSON.stringify(next));setSaved(next)}catch{setMessage('일정을 삭제하지 못했어요.')}}}/>
  </>:step===1?<div className="it-setup">
   <div className="it-setup-main" aria-busy={busy}><fieldset className="it-setup-fields" disabled={busy}>
    <div className="it-section-title"><span className="it-badge">{plan.purpose==='EVENT'?'행사 참여':'데이트'}</span><h2>{plan.purpose==='EVENT'?'언제, 어떤 행사에 갈까요?':'언제, 어디에서 만날까요?'}</h2></div>
    <div className="it-form-grid">
     <label>방문 날짜<input className="input" type="date" value={plan.day} onInput={e=>{patch({day:e.currentTarget.value});setAnchor(null)}}/></label>
     {plan.purpose==='DATE'?<label>동네<select className="select" value={plan.area} onChange={e=>patch({area:e.target.value})}>{areas.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>:<div className="it-event-area"><span>주변 장소 추천 기준</span><strong>{anchor?(areas.find(a=>a.id===eventArea(anchor.event.address,anchor.event.venueName))?.name||'행사장 위치 기준'):'행사를 고르면 정해져요'}</strong></div>}
    </div>
    {plan.purpose==='EVENT'&&<div className="it-anchor-picker">
     <div className="it-section-title"><h3>가려는 행사</h3><span>{anchor?'선택 완료':'한 곳을 선택해 주세요'}</span></div>
     <div className="it-event-search"><label><span className="sr-only">중심 행사 분야</span><select className="select" aria-label="중심 행사 분야" value={field} onChange={e=>{setField(e.target.value);setAnchor(null);patch({interests:undefined})}}>{categories.map(c=><option value={c.code} key={c.code}>{c.label}</option>)}</select></label><label><span className="sr-only">행사 이름 검색</span><input className="input" aria-label="행사 이름 검색" placeholder="행사 이름으로 검색" value={eventQuery} onChange={e=>{setEventQuery(e.target.value);setAnchor(null)}}/></label></div>
     {field==='SUBCULTURE'&&<TopicPicker rows={topicData.data||[]} selection={plan.interests||emptyTopics()} change={interests=>{patch({interests});setAnchor(null)}} loading={topicData.loading} error={topicData.error?.message||null} retry={()=>void topicData.reload()}/>}
     {data.loading?<p role="status">이 날짜의 행사를 확인하고 있어요.</p>:data.error?<p role="alert">행사 목록을 불러오지 못했어요. <button className="btn secondary" onClick={()=>void data.reload()}>다시 불러오기</button></p>:<div className="it-anchor-list">{anchorRows.slice(0,30).map(row=><button key={row.id} className={`it-anchor${anchor?.id===row.id?' chosen':''}`} aria-pressed={anchor?.id===row.id} onClick={()=>{setAnchor(row);patch({area:eventArea(row.event.address,row.event.venueName)});const from=row.event.occurrences.find(o=>o.startDate<=plan.day&&o.endDate>=plan.day)?.startTime?.slice(0,5);if(from)setAnchorTime(from)}}><ContentImage url={row.banner?.url} kind="event" eventType={row.event.subcategory} alt=""/><span><strong>{row.event.name}</strong><small>{row.event.venueName||'장소 확인 필요'}</small></span><span className="it-anchor-check">{anchor?.id===row.id?<DiscoveryIcon name="check" size={18}/>:'선택'}</span></button>)}{!anchorRows.length&&<p>이 날짜에 조건에 맞는 행사가 없어요. 날짜나 검색 조건을 바꿔 주세요.</p>}</div>}
     {anchor&&<label className="it-arrival"><span>행사 도착 예정 시간<small>추천 코스에서 이 시간을 고정해요.</small></span><input className="input" type="time" value={anchorTime} onInput={e=>setAnchorTime(e.currentTarget.value)}/></label>}
     {!data.loading&&!data.error&&!anchorRows.length&&nextMatches.length>0&&<div className="it-next-matches"><h4>다른 날짜에 열리는 관련 행사</h4>{nextMatches.map(({row,day})=><button type="button" key={row.id} onClick={()=>{patch({day,area:eventArea(row.event.address,row.event.venueName)});setAnchor(row);setAnchorTime(row.event.occurrences.find(o=>o.startDate<=day&&o.endDate>=day)?.startTime?.slice(0,5)||'10:00')}}><span>{day.slice(5).replace('-','.')}</span><strong>{row.event.name}</strong><small>이 날짜로 선택 →</small></button>)}</div>}
    </div>}
    <fieldset className="it-choice"><legend>{plan.purpose==='EVENT'?'방문 목적':'어떤 코스가 좋으세요?'}</legend><div>{(plan.purpose==='EVENT'?[['VIEW','전시·행사 관람'],['GOODS','굿즈·상품 구매'],['PERFORMANCE','공연·프로그램'],['FAN','팬 이벤트']]:[['CONTENT','전시·팝업 구경'],['RELAXED','먹고 쉬기'],['WALK','가볍게 둘러보기']]).map(([id,label])=><button type="button" className={plan.style===id?'chosen':''} aria-pressed={plan.style===id} key={id} onClick={()=>patch({style:id})}>{label}</button>)}</div></fieldset>
    <details className="it-hours-settings"><summary>하루 시간 <strong>{plan.start}–{plan.end}</strong><span>변경</span></summary><div className="it-form-grid"><label>하루 시작<input className="input" type="time" value={plan.start} onInput={e=>patch({start:e.currentTarget.value})}/></label><label>하루 마무리<input className="input" type="time" value={plan.end} onInput={e=>patch({end:e.currentTarget.value})}/></label></div></details>
    {!validDay(plan.day)&&<p className="it-field-error" role="alert">방문 날짜를 선택해 주세요.</p>}
    {timeMinutes(plan.end)<=timeMinutes(plan.start)&&<p className="it-field-error" role="alert">마무리를 시작 시간 이후로 설정해 주세요.</p>}
    {data.error&&plan.purpose==='DATE'&&<p className="it-field-error" role="alert">이 날짜의 행사를 확인하지 못했어요. <button onClick={()=>void data.reload()}>다시 확인</button></p>}
    <div className="it-setup-actions"><button className="btn secondary" onClick={()=>setStep(0)}>목적 다시 선택</button><button className="btn primary" onClick={()=>void generate()} disabled={busy||data.loading||!!data.error||!validDay(plan.day)||!Number.isFinite(timeMinutes(plan.start))||!Number.isFinite(timeMinutes(plan.end))||timeMinutes(plan.end)<=timeMinutes(plan.start)||(plan.purpose==='EVENT'&&(!anchor||!operatingOn(anchor,plan.day).length||!Number.isFinite(timeMinutes(anchorTime))))}>{busy?'주변 장소 찾는 중…':'코스 만들기'}<DiscoveryIcon name="arrow" size={17}/></button></div>
   </fieldset></div>
   <aside className="it-setup-aside"><h2>추천 코스 구성</h2><ol><li><span>1</span><div><strong>{plan.purpose==='EVENT'?anchor?.event.name||'선택한 행사':'동네 행사·팝업'}</strong><small>{plan.purpose==='EVENT'?'행사 시간과 장소를 중심으로':'선택한 날짜에 열리는 곳'}</small></div></li><li><span>2</span><div><strong>식사</strong><small>근처에서 함께 갈 곳</small></div></li><li><span>3</span><div><strong>카페·휴식</strong><small>쉬어 갈 장소</small></div></li></ol><p>추천 후 장소·시간·순서를 바꾸거나 가고 싶은 곳을 직접 넣을 수 있어요.</p></aside>
  </div>:<>
   <div className="it-plan-bar">
    <label className="it-title-input"><span>일정 이름</span><input maxLength={120} value={plan.title} placeholder="일정 이름을 입력하세요" onChange={e=>patch({title:e.target.value})}/></label>
    <label className="it-plan-date">방문 날짜<input className="input" type="date" value={plan.day} onInput={e=>patch({day:e.currentTarget.value})}/></label>
    <div className="it-plan-summary"><span className="it-badge">{plan.purpose==='EVENT'?'행사 참여':'데이트'}</span><strong>{plan.stops.length}곳</strong><span>{plan.purpose==='EVENT'?(areas.find(a=>a.id===plan.area)?.name||'행사장 위치 기준'):area.name}</span></div>
   </div>
   <div className="it-mobile-tabs" role="group" aria-label="일정 보기"><button aria-pressed={view==='list'} onClick={()=>setView('list')}><DiscoveryIcon name="calendar" size={17}/> 일정</button><button aria-pressed={view==='map'} onClick={()=>setView('map')}><DiscoveryIcon name="pin" size={17}/> 지도</button></div>
   <div className={`it-editor view-${view}`}>
    <div className="it-timeline">
     <div className="it-timeline-top"><h2>방문 순서</h2><span>↑↓로 순서 변경</span></div>
     <details className="it-day-settings"><summary><span>하루 시간</span><strong>{plan.start}–{plan.end}</strong><span>변경</span></summary><div className="it-day-range"><label>시작<input type="time" value={plan.start} onInput={e=>patch({start:e.currentTarget.value})}/></label><span>—</span><label>마무리<input type="time" value={plan.end} onInput={e=>patch({end:e.currentTarget.value})}/></label></div></details>
     {plan.stops.map((s,i)=><ItineraryStop key={s.id} stop={s} index={i} count={plan.stops.length} day={plan.day} selected={s.id===selected} expanded={s.id===editingId} issues={issueDetails.filter(issue=>issue.stopId===s.id).map(issue=>issue.message)} select={()=>setSelected(s.id)} toggle={()=>{setSelected(s.id);setEditingId(s.id===editingId?'':s.id)}} change={change=>editStop(s.id,change)} replace={()=>replace(s)} move={offset=>{patch({stops:moveStop(plan.stops,s.id,offset)});setSelected(s.id)}} remove={()=>{patch({stops:plan.stops.filter(x=>x.id!==s.id)});setEditingId('');setSelected(plan.stops.find(x=>x.id!==s.id)?.id||'')}} locate={()=>locate(s.id)}/>)}
     {!plan.stops.length&&<div className="it-empty"><h3>가고 싶은 곳을 추가해 주세요</h3><p>공개 행사나 직접 입력한 장소로 시작할 수 있어요.</p></div>}
     <button className="it-add-stop" onClick={()=>beginAdd('EVENT')}>＋ 장소 추가</button>
     {issues.length>0&&<div className="it-conflicts" role="status"><strong><DiscoveryIcon name="info" size={17}/> 시간 확인 {issues.length}건</strong><p>저장은 가능해요. 캘린더에 넣기 전에 시간을 맞춰 주세요.</p><ul>{issueDetails.map((issue,i)=><li key={`${issue.stopId}-${i}`}>{issue.stopId?<button onClick={()=>edit(issue.stopId!)}>{issue.message}<span>수정 →</span></button>:issue.message}</li>)}</ul></div>}
    </div>
    <aside className="it-map-panel">
     <div className="it-map-heading"><h2>방문 동선</h2><span>{plan.stops.filter(s=>s.point).length}곳 표시{plan.stops.some(s=>!s.point)&&` · 위치 확인 ${plan.stops.filter(s=>!s.point).length}곳`}</span></div>
     <ItineraryMap stops={plan.stops} selected={selected} center={center} onSelect={id=>{setSelected(id)}}/>
     <p className="it-map-caption">점선은 방문 순서이며 실제 이동 경로와 다를 수 있어요.</p>
     {focused&&<div className="it-map-selected"><span className="it-map-number">{plan.stops.indexOf(focused)+1}</span><div><strong>{focused.name}</strong><small>{focused.start} · {focused.duration}분</small></div><button onClick={()=>edit(focused.id)}>수정</button>{focused.point?<a href={`https://map.kakao.com/link/map/${encodeURIComponent(focused.name)},${focused.point.lat},${focused.point.lng}`} target="_blank" rel="noopener noreferrer">지도 ↗</a>:<button onClick={()=>locate(focused.id)}>위치 확인</button>}</div>}
     <div className="it-nearby-heading"><h3>코스에 더할 곳</h3><p>{plan.purpose==='EVENT'?'같은 분야의 행사와 주변 장소':'행사·식사·카페를 더하거나 직접 입력하세요.'}</p></div>
     <div className="it-add-choices"><button onClick={()=>beginAdd('EVENT')}><DiscoveryIcon name="ticket" size={18}/> 행사</button><button onClick={()=>beginAdd('PLACES')}><DiscoveryIcon name="pin" size={18}/> 음식점·카페</button><button onClick={()=>beginAdd('MANUAL')}>＋ 직접 입력</button></div>
     {candidates.filter(c=>!plan.stops.some(s=>s.eventId===c.row.id)).slice(0,2).map(c=><div className="it-recommend-card" key={c.row.id}><ContentImage url={c.row.banner?.url} kind="event" eventType={c.row.event.subcategory} alt=""/><div><small>{c.reason}</small><strong>{c.row.event.name}</strong><span>{c.row.event.venueName||'장소 확인 필요'}</span></div><button aria-label={`${c.row.event.name} 일정에 추가`} onClick={()=>insertEvent(c.row)}>＋</button></div>)}
     {placeError&&<p className="it-place-error" role="status">{placeError}</p>}{!nearbyAvailable&&<p className="it-check-note">주변 장소 검색은 준비 중이에요. 가고 싶은 곳을 직접 입력할 수 있어요.</p>}
    </aside>
   </div>
   <div className="it-save-bar"><div><strong>{dirty?'아직 저장하지 않은 변경사항이 있어요':savedSignature?'저장된 일정이에요':'아직 저장 전이에요'}</strong><span>이 브라우저에 저장 · 저장 후에도 수정 가능</span></div><button className="it-calendar" aria-label="캘린더 내보내기" disabled={!plan.stops.length||!!issues.length} title={issues.length?'시간 확인 항목을 수정하면 내보낼 수 있어요':undefined} onClick={download}><DiscoveryIcon name="download" size={17}/><span>캘린더 내보내기</span></button><button className="btn secondary it-share-button" disabled={!plan.stops.length||!validDay(plan.day)} onClick={()=>setShareOpen(true)}>공유</button><button className="btn primary" disabled={!plan.stops.length||!validDay(plan.day)|| (!!savedSignature&&!dirty)} onClick={save}>{savedSignature&&!dirty?'저장 완료':'일정 저장'}</button></div>
  </>}
  {addMode&&<PlaceDialog replacing={!!replaceId} mode={addMode} setMode={setAddMode} close={()=>{setAddMode(null);setReplaceId('');setLocationId('')}} center={center} events={candidates.filter(c=>replaceId||!plan.stops.some(s=>s.eventId===c.row.id)).map(c=>c.row)} places={visiblePlaces} busy={busy} error={placeError} loadNearby={()=>void loadNearby()} addEvent={insertEvent} addPlace={insertPlace} addManual={addStop} locateStop={plan.stops.find(s=>s.id===locationId)} locatePoint={point=>{editStop(locationId,{point});setAddMode(null);setLocationId('');setMessage('선택한 위치를 지도에 표시했어요.')}}/>}
  {shareOpen&&owner&&scope.current===storageKey&&<ShareDialog key={`${owner}:${plan.id}`} plan={plan} owner={owner} close={()=>setShareOpen(false)}/>}
  {resetOpen&&<Modal title="새 일정을 만들까요?" close={()=>setResetOpen(false)}><p>현재 수정사항은 저장하지 않았어요. 저장한 일정은 내 일정에 남아 있습니다.</p><div className="it-dialog-actions"><button className="btn secondary" onClick={()=>setResetOpen(false)}>계속 수정</button><button className="btn primary" onClick={()=>{setResetOpen(false);newPlan()}}>새로 만들기</button></div></Modal>}
 </section>
}

function PurposeCard({icon,title,text,action,onClick}:{icon:'ticket'|'sparkles';title:string;text:string;action:string;onClick:()=>void}){return <button className="it-purpose" onClick={onClick}><span className="it-purpose-top"><DiscoveryIcon name={icon} size={24}/><h3>{title}</h3></span><p>{text}</p><span className="it-purpose-bottom"><strong>{action}</strong><DiscoveryIcon name="arrow" size={20}/></span></button>}
function SavedPlans({rows,open,remove}:{rows:Plan[];open:(p:Plan)=>void;remove:(id:string)=>void}){const [deleting,setDeleting]=useState<Plan|null>(null);return <div className="it-saved"><h2>내 일정 <span>{rows.length}</span></h2>{rows.length?<div className="it-saved-grid">{rows.map(p=><article key={p.id}><small>{p.day} · {p.purpose==='EVENT'?'행사 참여':'데이트'}</small><h3>{p.title}</h3><p>{p.stops.length}곳 · {p.start}–{p.end}</p><div><button onClick={()=>open(p)}>열고 수정하기 <DiscoveryIcon name="arrow" size={15}/></button><button onClick={()=>setDeleting(p)}>삭제</button></div></article>)}</div>:<p>만든 일정을 저장하면 이 브라우저에서 다시 열 수 있어요.</p>}{deleting&&<Modal title="이 일정을 삭제할까요?" close={()=>setDeleting(null)}><p>{deleting.title}</p><div className="it-dialog-actions"><button className="btn secondary" onClick={()=>setDeleting(null)}>취소</button><button className="btn primary" onClick={()=>{remove(deleting.id);setDeleting(null)}}>삭제</button></div></Modal>}</div>}
function Modal({title,close,children}:{title:string;close:()=>void;children:ReactNode}){const titleId=useId(),dialog=useRef<HTMLDialogElement>(null),closeRef=useRef(close);closeRef.current=close;useEffect(()=>{const el=dialog.current!;return openCatalogDialog(el,el.querySelector<HTMLElement>('h2'),document.activeElement as HTMLElement)},[]);return <dialog ref={dialog} className="it-dialog" aria-labelledby={titleId} onCancel={e=>{e.preventDefault();closeRef.current()}}><header><h2 id={titleId} tabIndex={-1}>{title}</h2><button aria-label="창 닫기" onClick={close}><DiscoveryIcon name="close"/></button></header><div className="it-dialog-body">{children}</div></dialog>}
function PlaceDialog({replacing=false,mode,setMode,close,center,events,places,busy,error,loadNearby,addEvent,addPlace,addManual,locateStop,locatePoint}:{replacing?:boolean;mode:AddMode;setMode:(m:AddMode)=>void;close:()=>void;center:Point;events:PublicEventSummary[];places:Place[];busy:boolean;error:string;loadNearby:()=>void;addEvent:(r:PublicEventSummary)=>void;addPlace:(p:Place)=>void;addManual:(p:PlanStop)=>void;locateStop?:PlanStop;locatePoint:(p:Point)=>void}){
 const [query,setQuery]=useState(locateStop?.address||locateStop?.venueName||''),[name,setName]=useState(''),[address,setAddress]=useState(''),[kind,setKind]=useState<StopKind>('PLACE'),[point,setPoint]=useState<Point|null>(null),[searching,setSearching]=useState(false),[results,setResults]=useState<Place[]>([]),[searchError,setSearchError]=useState(''),[chosenPlace,setChosenPlace]=useState<Place|null>(null)
 const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 const search=async()=>{setSearching(true);setSearchError('');try{const result=await searchPlaces(query,center);if(alive.current)setResults(result)}catch(e){if(alive.current)setSearchError(e instanceof Error?e.message:'검색하지 못했어요.')}finally{if(alive.current)setSearching(false)}}
 const draftStop:PlanStop={id:'location-preview',kind,name:locateStop?.name||name||'선택한 위치',address,point,start:'13:00',duration:60,locked:false,note:'',url:'',source:'MANUAL'}
 return <Modal title={mode==='LOCATE'?'지도 위치 확인':replacing?'장소 바꾸기':'장소 추가'} close={close}>{replacing&&<p className="it-check-note">장소를 바꿔도 기존 방문 시간은 유지돼요.</p>}{mode!=='LOCATE'&&<div className="it-dialog-tabs">{([['EVENT','공개 행사'],['PLACES','음식점·카페'],['MANUAL','직접 입력']] as [AddMode,string][]).map(([m,label])=><button key={m} aria-pressed={mode===m} onClick={()=>setMode(m)}>{label}</button>)}</div>}
 {mode==='EVENT'?<><input className="input" aria-label="추가할 행사 검색" value={query} onChange={e=>setQuery(e.target.value)} placeholder="선택한 날짜·동네의 행사 검색"/><div className="it-dialog-results">{events.filter(r=>r.event.name.includes(query)).map(row=><button className="it-result" key={row.id} onClick={()=>addEvent(row)}><ContentImage url={row.banner?.url} kind="event" eventType={row.event.subcategory} alt=""/><span><strong>{row.event.name}</strong><small>{row.event.venueName}</small></span><b>＋</b></button>)}{!events.filter(r=>r.event.name.includes(query)).length&&<p>조건에 맞는 추가 행사가 없어요. 직접 입력으로 가고 싶은 곳을 더할 수 있어요.</p>}</div></>:mode==='PLACES'?<><div className="it-nearby-search"><p>지도 중심 근처의 음식점·카페를 찾아요.</p><button className="btn secondary" disabled={busy||!nearbyAvailable} onClick={loadNearby}>{busy?'확인 중…':places.length?'다시 확인':'주변 장소 찾기'}</button></div>{error&&<p role="alert">{error}</p>}<div className="it-dialog-results">{places.map(p=><button className="it-result" key={p.id} onClick={()=>addPlace(p)}><span className="it-result-kind">{p.kind==='FOOD'?'식사':'카페'}</span><span><strong>{p.name}</strong><small>직선거리 {((p.distance||0)*1000).toFixed(0)}m · 영업·예약 확인 필요</small></span><b>＋</b></button>)}</div><p className="it-check-note">{places.length>0&&<>{places.some(p=>p.provider==='KAKAO')?<a href="https://map.kakao.com/" target="_blank" rel="noopener noreferrer">카카오맵 장소 정보</a>:'OpenStreetMap 장소 정보'} · </>}인기·평점 순위가 아닙니다.</p><button className="it-locate" onClick={()=>setMode('MANUAL')}>가고 싶은 음식점 직접 입력</button></>:<>
 {mode==='LOCATE'&&<p className="it-check-note">{locateStop?.name}<br/>{locateStop?.address}<br/>검색 결과를 확인하거나 지도에서 행사장의 정확한 위치를 골라 주세요.</p>}
 {placeSearchAvailable&&<><form className="it-location-search" onSubmit={e=>{e.preventDefault();void search()}}><input className="input" aria-label="지도 장소 검색" value={query} onChange={e=>setQuery(e.target.value)} placeholder="장소 이름 또는 주소"/><button className="btn secondary" disabled={searching||query.trim().length<2}>{searching?'검색 중…':'검색'}</button></form>{searchError&&<p role="alert">{searchError}</p>}{results.length>0&&<div className="it-search-results">{results.map(p=><button key={p.id} onClick={()=>{setPoint(p.point);if(mode==='MANUAL'){setName(p.name);setAddress(p.address);setChosenPlace(p)}}}><strong>{p.name}</strong><small>{p.address}</small><span>위치 선택</span></button>)}</div>}{!searching&&!results.length&&searchError===''&&query&&<p className="it-check-note">검색 결과를 확인한 뒤 위치를 선택하세요.</p>}</>}
 {mode==='MANUAL'&&<div className="it-form-grid"><label>장소 이름<input className="input" value={name} maxLength={200} onChange={e=>{setName(e.target.value);setChosenPlace(null)}} placeholder="가고 싶은 장소"/></label><label>종류<select className="select" value={kind} onChange={e=>setKind(e.target.value as StopKind)}>{(['PLACE','FOOD','CAFE'] as StopKind[]).map(k=><option value={k} key={k}>{kindNames[k]}</option>)}</select></label><label className="it-form-wide">주소<input className="input" value={address} maxLength={400} onChange={e=>{setAddress(e.target.value);setChosenPlace(null)}} placeholder="공개된 주소를 입력하세요"/></label></div>}
 <div className="it-picker"><ItineraryMap stops={point?[draftStop]:[]} selected="location-preview" center={center} onSelect={()=>{}} onPick={point=>{setPoint(point);setChosenPlace(null)}} picking/></div><p className="it-check-note">{point?'지도 위치를 선택했어요. 주소와 같은 장소인지 확인해 주세요.':'지도에서 위치를 누르면 핀이 표시됩니다.'}</p><div className="it-dialog-actions"><button className="btn secondary" onClick={close}>취소</button><button className="btn primary" disabled={mode==='LOCATE'?!point:!name.trim()} onClick={()=>{if(mode==='LOCATE'&&point)locatePoint(point);else if(mode==='MANUAL')addManual(manualPlaceStop({...draftStop,id:crypto.randomUUID(),name:name.trim(),address:address.trim()},chosenPlace))}}>{mode==='LOCATE'?'이 위치로 표시':replacing?'이 장소로 바꾸기':'일정에 추가'}</button></div><small className="it-source-label">{results.length>0&&<>{results.some(p=>p.provider==='KAKAO')?<a href="https://map.kakao.com/" target="_blank" rel="noopener noreferrer">장소 검색: 카카오맵</a>:'장소 검색: OpenStreetMap / Photon'} · </>}위치는 선택한 내용으로 저장됩니다.</small>
 </>}</Modal>
}
