import {useCallback,useEffect,useId,useMemo,useRef,useState,type ReactNode} from 'react'
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
import {RegionPicker} from './RegionPicker'
import {EventPicker} from './EventPicker'
import {regionArea,regionForEvent} from './regionCatalog'
import {regionCounts,regionEvents} from './regions'
import {ShareDialog} from './ShareDialog'
import {SaveComplete} from './SaveComplete'
import {usePersonalPlans} from './usePersonalPlans'
import type {ImportOutcome} from './PersonalPlanStore'
import {EventPreview} from './EventPreview'
import {fitTimes,readWizardDraft,type WizardDraft} from './wizard'
import {emptyTopics,matchesTopics,upcomingMatches} from './topics'
import {areas,distance,eventStop,kindNames,moveStop,nextStart,operatingOn,planCalendar,planIssueDetails,planIssues,readPlans,recommendedEvents,savedPlanSignature,timeMinutes,validPoint,writePlan,type Plan,type PlanStop,type Point,type Purpose,type StopKind} from './model'
import {nearbyAvailable,nearbyPlaces,placeSearchAvailable,placeStop,resolveAddress,searchPlaces,type Place} from './places'
import {eventArea,eventLocationMessage,manualPlaceStop,planNearbyCenter,resolveEventLocation} from './recommendation'
import './itinerary.css'

const initialPlan=(purpose:Purpose='DATE'):Plan=>({version:1,id:crypto.randomUUID(),title:'',purpose,day:seoulToday(),start:purpose==='DATE'?'13:00':'10:00',end:'19:00',area:'',style:purpose==='DATE'?'CONTENT':'VIEW',stops:[],updatedAt:new Date().toISOString()})
type AddMode='EVENT'|'PLACES'|'MANUAL'|'LOCATE'
interface PopupData {places:{event_id:number;address:string;latitude:number|null;longitude:number|null}[]}
interface ImportIssue {message:string;deleted:boolean}
export function ItineraryPage(){
 const [params,setParams]=useSearchParams(),auth=useAuth(),owner=auth.status==='authenticated'&&auth.user?`member:${auth.user.id}`:auth.status==='anonymous'?'guest':''
 const storageKey=`boothhana.itineraries.v1:${owner}`,draftKey=`${storageKey}:draft`
 const [plan,setPlan]=useState<Plan>(()=>initialPlan()),[step,setStep]=useState(-1),[selected,setSelected]=useState(''),[view,setView]=useState('list')
 const [editingId,setEditingId]=useState(''),[undoPlan,setUndoPlan]=useState<Plan|null>(null),[wizardDraft,setWizardDraft]=useState<WizardDraft|null>(null),[duration,setDuration]=useState(60),[preview,setPreview]=useState<PublicEventSummary|null>(null),[placeKind,setPlaceKind]=useState<StopKind>('FOOD')
 const [shareOpen,setShareOpen]=useState(false)
 const heading=useRef<HTMLHeadingElement>(null)
 const personal=usePersonalPlans(owner),saved=useMemo(()=>personal.state.records.map(r=>r.plan),[personal.state.records])
 const [planRevision,setPlanRevision]=useState(0),[saveConflict,setSaveConflict]=useState(false),[importing,setImporting]=useState(false)
 const [importIssues,setImportIssues]=useState<Record<string,ImportIssue>>({}),[discardingLocal,setDiscardingLocal]=useState<Plan|null>(null)
 const [latestOpen,setLatestOpen]=useState(false)
 const [draft,setDraft]=useState<Plan|null>(null),[savedSignature,setSavedSignature]=useState('')
 const [anchor,setAnchor]=useState<PublicEventSummary|null>(null),[field,setField]=useState('ALL'),[eventQuery,setEventQuery]=useState(''),[anchorTime,setAnchorTime]=useState('10:00')
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[places,setPlaces]=useState<Place[]>([]),[placeError,setPlaceError]=useState('')
 const [addMode,setAddMode]=useState<AddMode|null>(null),[replaceId,setReplaceId]=useState(''),[locationId,setLocationId]=useState(''),[resetOpen,setResetOpen]=useState(false)
 const scope=useRef(''),job=useRef(0),ownerRef=useRef(owner),pendingStep=useRef<number|null>(null);ownerRef.current=owner
 const requestedEvent=params.get('event')||'',requestedDay=params.get('day')||''
 const requestedPlan=params.get('plan')||''
 const requestedSaved=params.get('saved')||''
 const area=areas.find(a=>a.id===plan.area)||areas[0]
 const areaName=regionArea(plan.area)?.name||(plan.area==='UNLOCATED'?'지역 확인 중':plan.area?area.name:'행사장 위치 기준')

 const data=useRemote("features/itinerary/ItineraryPage:ItineraryPage:data", async()=>{
  if(!validDay(plan.day))return []
  const result=await Promise.allSettled(categories.map(c=>publicCatalogApi.calendar(new URLSearchParams({category:c.code,from:plan.day,to:plan.day,sort:'DATE_ASC'}).toString())))
  if(result.some(r=>r.status==='rejected'))throw new Error('행사 목록을 모두 확인하지 못했어요. 다시 불러와 주세요.')
  return result.flatMap(r=>r.status==='fulfilled'?r.value:[])
 },[plan.day])
 const rows=useMemo(()=>data.data||[],[data.data])
 const topicData=useRemote("features/itinerary/ItineraryPage:ItineraryPage:topicData", async()=>{
  if(step!==3||field!=='SUBCULTURE')return []
  const from=seoulToday(),date=new Date(`${from}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+90)
  return publicCatalogApi.calendar(new URLSearchParams({category:'SUBCULTURE',from,to:date.toISOString().slice(0,10),sort:'DATE_ASC'}).toString())
 },[step===3,field])
 const popup=useRemote("features/itinerary/ItineraryPage:ItineraryPage:popup", ()=>validDay(plan.day)?publicRead<PopupData>(`/api/public/catalog/popups?from=${plan.day}&to=${plan.day}`).catch(()=>({places:[]})):Promise.resolve({places:[]}),[plan.day])
 const pointFor=(row:PublicEventSummary):Point|null=>{const p=popup.data?.places.find(p=>p.event_id===row.id&&p.address===row.event.address),point=p?{lat:p.latitude,lng:p.longitude}:null;return validPoint(point)?point:null}
 const resolvedAnchor=useMemo(()=>{
  if(!anchor)return null
  for(const row of rows){const place=operatingOn(row,plan.day).find(p=>p.eventId===anchor.id);if(place)return {...anchor,event:{...anchor.event,address:anchor.event.address||place.event.address,venueName:anchor.event.venueName||place.event.venueName}}}
  return anchor
 },[anchor,rows,plan.day])
 const anchorPoint=useRemote("features/itinerary/ItineraryPage:ItineraryPage:anchorPoint", ()=>resolvedAnchor?resolveEventLocation(resolvedAnchor.event.address,pointFor(resolvedAnchor),resolveAddress):Promise.resolve(null),[resolvedAnchor?.id,resolvedAnchor?.event.address,popup.data])
 const nearbyCenter=step<6?(resolvedAnchor?anchorPoint.data||null:regionArea(plan.area)?.point||null):planNearbyCenter(plan,area.point),center=nearbyCenter||area.point
 const recommendationAnchor=useMemo(()=>{
  if(resolvedAnchor)return resolvedAnchor
  const main=plan.stops.find(s=>s.kind==='EVENT'&&s.locked)||plan.stops.find(s=>s.kind==='EVENT')
  if(!main?.eventId)return undefined
  for(const row of rows){const place=operatingOn(row,plan.day).find(p=>p.eventId===main.eventId);if(place)return {...row,id:place.eventId,event:place.event,operatingPlaces:undefined}}
  return undefined
 },[resolvedAnchor,rows,plan.stops,plan.day])
 const recommendationArea=plan.purpose==='EVENT'?eventArea(recommendationAnchor?.event.address,recommendationAnchor?.event.venueName):plan.area
 const nearbyEventPoints=useRemote("features/itinerary/ItineraryPage:ItineraryPage:nearbyEventPoints", async()=>{
  if(!nearbyCenter||step<4)return {} as Record<number,Point>
  const possible=rows.flatMap(row=>operatingOn(row,plan.day).map(p=>({...row,id:p.eventId,event:p.event,operatingPlaces:undefined}))).filter(row=>row.id!==recommendationAnchor?.id&&!!row.event.address).filter(row=>{const r=regionForEvent(row.event);return r&&(r.id===recommendationArea||distance(nearbyCenter,r.point)<=12)}).sort((a,b)=>distance(nearbyCenter,regionForEvent(a.event)!.point)-distance(nearbyCenter,regionForEvent(b.event)!.point)).slice(0,12)
  const result=await Promise.all(possible.map(async row=>[row.id,await resolveEventLocation(row.event.address,pointFor(row),resolveAddress)] as const))
  return Object.fromEntries(result.filter((entry):entry is readonly[number,Point]=>validPoint(entry[1])))
 },[rows,plan.day,nearbyCenter?.lat,nearbyCenter?.lng,step>=4,recommendationArea,recommendationAnchor?.id])
 const candidates=useMemo(()=>!areas.some(a=>a.id===recommendationArea)||(plan.purpose==='EVENT'&&!recommendationAnchor)?[]:recommendedEvents(rows,plan.day,recommendationArea,recommendationAnchor||undefined,plan.purpose,[],plan.interests,nearbyCenter?{center:nearbyCenter,points:nearbyEventPoints.data||{}}:undefined),[rows,plan.day,recommendationArea,plan.purpose,recommendationAnchor,plan.interests,nearbyCenter,nearbyEventPoints.data])
 const visiblePlaces=(nearbyCenter?places:[]).map(p=>({...p,distance:distance(center,p.point)})).filter(p=>p.distance<=1.2).sort((a,b)=>a.distance-b.distance)
 const counts=useMemo(()=>regionCounts(rows,plan.day),[rows,plan.day])
 const localRows=useMemo(()=>regionEvents(rows,plan.day,plan.area),[rows,plan.day,plan.area])
 const localTopics=useMemo(()=>(topicData.data||[]).flatMap(row=>row.operatingPlaces?.length?row.operatingPlaces.map(p=>({...row,id:p.eventId,event:p.event,operatingPlaces:undefined})):[row]).filter(row=>regionForEvent(row.event)?.id===plan.area).filter((r,i,all)=>all.findIndex(x=>x.id===r.id)===i),[topicData.data,plan.area])
 const anchorRows=localRows.filter(row=>(field==='ALL'||categoryForType(row.event.subcategory).code===field)&&row.event.name.toLocaleLowerCase().includes(eventQuery.toLocaleLowerCase())&&(field!=='SUBCULTURE'||matchesTopics(row,plan.interests)))
 const nextMatches=field==='SUBCULTURE'&&!anchorRows.length?upcomingMatches(localTopics,plan.interests||emptyTopics(),plan.day).filter(x=>regionForEvent(x.row.event)?.id===plan.area&&x.row.event.name.toLocaleLowerCase().includes(eventQuery.toLocaleLowerCase())).slice(0,3):[]
 const alternativeDates=useRemote("features/itinerary/ItineraryPage:ItineraryPage:alternativeDates", async()=>{
  if(step!==3||localRows.length||!regionArea(plan.area)||!validDay(plan.day))return []
  const date=new Date(`${plan.day}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+14)
  const upcoming=await Promise.all(categories.map(c=>publicCatalogApi.calendar(new URLSearchParams({category:c.code,from:plan.day,to:date.toISOString().slice(0,10),sort:'DATE_ASC'}).toString())))
  return upcoming.flat().flatMap(row=>(row.operatingPlaces?.length?row.operatingPlaces:[{eventId:row.id,event:row.event}]).filter(place=>regionForEvent(place.event)?.id===plan.area).flatMap(place=>place.event.occurrences.map(o=>({row:{...row,id:place.eventId,event:place.event,operatingPlaces:undefined},day:o.startDate>plan.day?o.startDate:plan.day})))).filter(x=>x.day>plan.day&&operatingOn(x.row,x.day).length).sort((a,b)=>a.day.localeCompare(b.day)).filter((x,i,all)=>all.findIndex(y=>y.row.id===x.row.id)===i).slice(0,3)
 },[step===3,localRows.length,plan.area,plan.day])
 const signature=JSON.stringify(plan),dirty=step===6&&signature!==savedSignature
 const go=useCallback((next:number,replace=false)=>{pendingStep.current=next;setStep(next);setParams(next<0?{}:{step:String(next)},{replace})},[setParams])
 const resumeWizard=useCallback((value:WizardDraft)=>{const token=++job.current;setPlan(value.plan);setField(value.field);setEventQuery(value.query);setDuration(value.duration);setAnchorTime(value.anchorTime);setAnchor(null);setUndoPlan(null);go(value.step,true);if(value.anchorId){setBusy(true);void publicCatalogApi.event(String(value.anchorId)).then(row=>{if(token===job.current&&scope.current===storageKey)setAnchor({...row,participantCount:row.participants.length})}).catch(()=>{if(token===job.current){setMessage('선택했던 행사를 확인하지 못했어요. 다시 골라 주세요.');go(3,true)}}).finally(()=>{if(token===job.current)setBusy(false)})}}, [storageKey,go])
 useEffect(()=>{if(scope.current!==storageKey||requestedEvent||requestedPlan||requestedSaved)return;const value=params.get('step'),n=value===null?-1:Number(value);if(pendingStep.current!==null){if(n!==pendingStep.current)return;pendingStep.current=null}if(value===null){setStep(-1);return}if(Number.isInteger(n)&&n>=0&&n<=6){if(step>=6&&n>0&&n<6){const previous=readWizardDraft(localStorage,`${storageKey}:wizard`);if(previous){resumeWizard({...previous,step:n});return}setStep(-1);setParams({},{replace:true});return}setStep(n)}},[params,storageKey,requestedEvent,requestedPlan,requestedSaved,step,setParams,resumeWizard])
 const issueDetails=planIssueDetails(plan),issues=planIssues(plan),focused=plan.stops.find(s=>s.id===selected)
 useEffect(()=>{setEditingId('');const frame=requestAnimationFrame(()=>{window.scrollTo({top:0,behavior:'auto'});heading.current?.focus({preventScroll:true})});return()=>cancelAnimationFrame(frame)},[step])
 useEffect(()=>{
  if(!owner){setImportIssues({});setDiscardingLocal(null);setImporting(false);setLatestOpen(false);setShareOpen(false);scope.current='';job.current++;setBusy(false);setAddMode(null);setPlanRevision(0);setDraft(null);setWizardDraft(null);setUndoPlan(null);setPlan(initialPlan());setStep(-1);setSelected('');return}
  if(scope.current===storageKey)return
  setImportIssues({});setDiscardingLocal(null);setLatestOpen(false);setImporting(false);setSaveConflict(false);setPlanRevision(0);setShareOpen(false);scope.current=storageKey;job.current++;setBusy(false);setPlaces([]);setAddMode(null);setAnchor(null);setSavedSignature('');setPlan(initialPlan());setStep(-1);setWizardDraft(null);setUndoPlan(null)
  const stored=owner==='guest'?readPlans(localStorage,storageKey):[],editor=readPlans(localStorage,draftKey)[0]||readPlans(sessionStorage,draftKey)[0]||null,cached=readWizardDraft(localStorage,`${storageKey}:wizard`)
  setDraft(editor&&savedPlanSignature(stored,editor.id)!==JSON.stringify(editor)?editor:null);setWizardDraft(cached)
  if(params.get('step')==='6'&&editor){setPlanRevision(readDraftRevision(draftKey));setPlan(editor);setSelected(editor.stops[0]?.id||'');setSavedSignature(savedPlanSignature(stored,editor.id));setStep(6)}else if(params.has('step')&&cached)resumeWizard(cached)
 },[owner,storageKey,draftKey,params,resumeWizard])
 useEffect(()=>{
  if(!owner||!personal.ready||!requestedPlan||scope.current!==storageKey)return
  const p=saved.find(p=>p.id===requestedPlan)
  if(p){setPlanRevision(personal.state.records.find(r=>r.plan.id===p.id)?.revision||0);setPlan(p);setAnchor(null);go(6,true);setSelected(p.stops[0]?.id||'');setSavedSignature(JSON.stringify(p))}
 },[owner,requestedPlan,storageKey,go,personal.ready,saved,personal.state.records])
 useEffect(()=>{
  if(!owner||!personal.ready||!requestedSaved||requestedEvent||requestedPlan||scope.current!==storageKey)return
  const rows=saved,completed=rows.find(p=>p.id===requestedSaved)
  pendingStep.current=null;setShareOpen(false)
  if(!completed){setMessage('저장한 일정을 찾지 못했어요. 이 브라우저의 내 일정을 확인해 주세요.');go(-1,true);return}
  const editor=readPlans(localStorage,draftKey)[0]||readPlans(sessionStorage,draftKey)[0]||null
  setDraft(editor&&savedPlanSignature(rows,editor.id)!==JSON.stringify(editor)?editor:null)
  setPlanRevision(personal.state.records.find(r=>r.plan.id===completed.id)?.revision||0);setPlan(completed);setSavedSignature(JSON.stringify(completed));setAnchor(null);setStep(7);setMessage('')
 },[owner,requestedSaved,requestedEvent,requestedPlan,storageKey,draftKey,go,personal.ready,saved,personal.state.records])
 useEffect(()=>{
  if(!owner||!/^[1-9]\d*$/.test(requestedEvent))return
  let active=true
   void publicCatalogApi.event(requestedEvent).then(row=>{if(!active)return;const day=defaultDay(row.event,requestedDay);setAnchor({...row,participantCount:row.participants.length});setField(categoryForType(row.event.subcategory).code);const start=row.event.occurrences.find(o=>o.startDate<=day&&o.endDate>=day)?.startTime?.slice(0,5)||'10:00';setAnchorTime(start);setPlan({...initialPlan('EVENT'),day:day||seoulToday(),area:regionForEvent(row.event)?.id||eventArea(row.event.address,row.event.venueName)});setDuration(row.event.subcategory==='BIRTHDAY_CAFE'||categoryForType(row.event.subcategory).code==='POPUP'?60:180);go(4,true)}).catch(()=>{if(active)setMessage('중심 행사를 불러오지 못했어요. 목록에서 다시 골라 주세요.')})
  return()=>{active=false}
 },[requestedEvent,requestedDay,owner,go])
 useEffect(()=>{
  if(!owner||step!==6||!plan.stops.length||scope.current!==storageKey)return
  try{writePlan(localStorage,draftKey,plan);localStorage.setItem(`${draftKey}:revision`,String(planRevision));setDraft(JSON.stringify(plan)!==savedSignature?plan:null)}catch{ /* Explicit save reports storage failures; drafts are optional. */ }
 },[plan,step,owner,storageKey,draftKey,savedSignature,planRevision])
 useEffect(()=>{if(!owner||busy||scope.current!==storageKey||step<1||step>5)return;const value:WizardDraft={version:1,plan,step,anchorId:anchor?.id||null,anchorTime,duration,field,query:eventQuery,updatedAt:new Date().toISOString()};try{localStorage.setItem(`${storageKey}:wizard`,JSON.stringify(value));setWizardDraft(value)}catch{/* Explicit final save reports storage errors. */}},[plan,step,anchor,anchorTime,duration,field,eventQuery,owner,storageKey,busy])

 const patch=(change:Partial<Plan>)=>{if(step===6)setUndoPlan(plan);setPlan(p=>({...p,...change}));setMessage('')}
 const editStop=(id:string,change:Partial<PlanStop>)=>{if(step===6)setUndoPlan(plan);setPlan(p=>({...p,stops:p.stops.map(s=>s.id===id?{...s,...change}:s)}));setMessage('')}
 const newPlan=()=>{setPlanRevision(0);job.current++;setBusy(false);setPlan(initialPlan());setAnchor(null);setField('ALL');setEventQuery('');setStep(0);setSelected('');setEditingId('');setView('list');setSavedSignature('');setPlaces([]);setPlaceError('');setMessage('');setDraft(null);setWizardDraft(null);setUndoPlan(null);setDuration(60);go(0);try{sessionStorage.removeItem(draftKey);localStorage.removeItem(draftKey);localStorage.removeItem(`${storageKey}:wizard`)}catch{/* optional */}}
 const restore=(p:Plan)=>{setSaveConflict(false);setPlanRevision(p===draft?readDraftRevision(draftKey):personal.state.records.find(r=>r.plan.id===p.id)?.revision||0);job.current++;setBusy(false);setPlaces([]);setPlaceError('');setAddMode(null);setPlan(p);setAnchor(null);setStep(6);setSelected(p.stops[0]?.id||'');setEditingId('');setView('list');setSavedSignature(savedPlanSignature(saved,p.id));setUndoPlan(null);setMessage('');go(6)}
 const importLocal=async(p?:Plan,newCopy=false)=>{
  const currentScope=storageKey;setImporting(true);setMessage('')
  try{
   let outcomes:ImportOutcome[]
   if(p){try{await personal.store.importOne(p,newCopy);outcomes=[{plan:p,error:null}]}catch(error){outcomes=[{plan:p,error:error instanceof Error?error:new Error('일정을 가져오지 못했어요.')}]} }
   else outcomes=await personal.store.importAll()
   if(scope.current!==currentScope)return
   setImportIssues(previous=>{const next={...previous};for(const result of outcomes){const key=JSON.stringify(result.plan);if(result.error)next[key]={message:result.error.message,deleted:'status' in result.error&&result.error.status===404};else delete next[key]}return next})
   const failed=outcomes.filter(result=>result.error).length,succeeded=outcomes.length-failed
   setMessage(failed?`${succeeded?`${succeeded}개를 가져왔어요. `:''}${failed}개는 가져오지 못했어요. 각 일정에서 다시 시도할 수 있어요.`:`${succeeded}개 일정을 계정으로 가져왔어요.`)
  }catch(error){if(scope.current===currentScope)setMessage(error instanceof Error?error.message:'일정을 가져오지 못했어요.')}
  finally{if(scope.current===currentScope)setImporting(false)}
 }
 const discardLocal=async(p:Plan)=>{
  const currentScope=storageKey;setDiscardingLocal(null);setMessage('')
  try{await personal.store.discardLocal(p);if(scope.current!==currentScope)return;setImportIssues(previous=>{const next={...previous};delete next[JSON.stringify(p)];return next});setMessage('이 기기의 원본 일정에서 제외했어요.')}
  catch(error){if(scope.current===currentScope)setMessage(error instanceof Error?error.message:'이 기기의 일정을 정리하지 못했어요.')}
 }
 const addStop=(stop:PlanStop)=>{
  if(step===6)setUndoPlan(plan)
  if(replaceId){setPlan(p=>({...p,stops:p.stops.map(s=>s.id===replaceId?{...stop,start:s.start,duration:s.duration,locked:s.locked}:s)}))}
  else{const mainCount=step<6&&anchor&&!plan.stops.some(s=>s.eventId===anchor.id)?1:0;if(plan.stops.length+mainCount>=20){setMessage('중심 행사를 포함해 한 일정에는 최대 20곳까지 추가할 수 있어요.');return}if(stop.source==='MANUAL'||step<6)stop={...stop,start:nextStart(plan,stop.duration)||plan.start};setPlan(p=>({...p,stops:[...p.stops,stop]}))}
  setSelected(stop.id);setEditingId(stop.id);setView('list');setAddMode(null);setReplaceId('');setMessage(replaceId?'장소를 바꿨어요. 기존 방문 시간은 유지했어요.':'장소를 추가했어요. 방문 시간을 확인해 주세요.')
 }
 const insertEvent=(row:PublicEventSummary)=>{if(plan.stops.some(s=>s.id!==replaceId&&s.eventId===row.id)){setMessage('이미 일정에 있는 행사예요.');return}const time=nextStart(plan,60)||plan.start;addStop(eventStop(row,plan.day,time,pointFor(row)||nearbyEventPoints.data?.[row.id]||null))}
 const insertPlace=(place:Place)=>{if(!nearbyCenter){setPlaceError(eventLocationMessage);return}const duration=place.kind==='FOOD'?60:45;addStop(placeStop(place,nextStart(plan,duration)||plan.start))}
 const loadNearby=async()=>{if(!nearbyCenter){setPlaces([]);setPlaceError(eventLocationMessage);return}const token=++job.current,currentOwner=owner;setBusy(true);setPlaceError('');try{const result=await nearbyPlaces(nearbyCenter);if(token===job.current&&currentOwner===ownerRef.current)setPlaces(result)}catch(e){if(token===job.current)setPlaceError(e instanceof Error?e.message:'장소를 확인하지 못했어요.')}finally{if(token===job.current)setBusy(false)}}
 const generate=async()=>{
  if(!owner||!validDay(plan.day)||timeMinutes(plan.end)<=timeMinutes(plan.start)||(plan.purpose==='EVENT'&&!anchor))return
  const token=++job.current,currentOwner=owner;setBusy(true);setMessage('');setPlaceError('');setPlaces([])
  const next={...plan,title:plan.title||(plan.purpose==='DATE'?`${areaName} 데이트`:anchor!.event.name+' 방문'),stops:[] as PlanStop[]}
  const main=resolvedAnchor
  const mainPoint=main?await resolveEventLocation(main.event.address,pointFor(main),resolveAddress):null
  if(token!==job.current||currentOwner!==ownerRef.current)return
  const buildMain=(start:string)=>{if(!main)return null;const stop=eventStop(main,plan.day,start,mainPoint);stop.duration=duration;if(plan.purpose==='EVENT'){stop.start=anchorTime;stop.locked=true}return stop}
  const initialMain=buildMain(plan.start)
  if(initialMain)next.stops.push(initialMain)
  for(const extra of plan.stops){if(next.stops.some(stop=>stop.eventId&&stop.eventId===extra.eventId))continue;const start=nextStart(next,extra.duration)||extra.start;next.stops.push({...extra,start:extra.locked?extra.start:start})}
  if(token!==job.current||currentOwner!==ownerRef.current)return
  if(!next.stops.length&&initialMain)next.stops.push(initialMain)
  setPlan(next);setSelected(next.stops[0]?.id||'');go(6);setBusy(false);setSavedSignature('');setWizardDraft(null);window.scrollTo({top:0,behavior:'auto'})
 }
 const save=async()=>{
  if(!owner||!plan.stops.length||personal.state.busy)return
  let next={...plan,title:plan.title.trim()||'나의 하루 일정',updatedAt:new Date().toISOString()}
  const currentScope=storageKey
  try{const stored=await personal.store.save(next,planRevision);if(scope.current!==currentScope)return;next=stored.plan;setPlanRevision(stored.revision)}catch(e){if(scope.current===currentScope){setMessage(e instanceof Error?e.message:'일정을 저장하지 못했어요.');setSaveConflict(true)}return}
  setSaveConflict(false);setPlan(next);setSavedSignature(JSON.stringify(next));setDraft(null);setWizardDraft(null);setUndoPlan(null);setMessage('')
  // Draft cleanup is optional; a cleanup failure must not turn a successful save into an error.
  try{sessionStorage.removeItem(draftKey);localStorage.removeItem(draftKey);localStorage.removeItem(`${storageKey}:wizard`)}catch{/* optional */}
  pendingStep.current=null;setStep(7);setParams({saved:next.id},{replace:true})
 }
 const download=()=>{try{const content=planCalendar(plan),url=URL.createObjectURL(new Blob([content],{type:'text/calendar;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`boothhana-plan-${plan.day}.ics`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setMessage('캘린더 파일을 내려받았어요. 변경 후에는 다시 내려받아 주세요.')}catch{setMessage('표시된 시간 문제를 수정한 뒤 캘린더에 추가해 주세요.')}}
 const edit=(id:string)=>{setSelected(id);setEditingId(id);setView('list');requestAnimationFrame(()=>{const row=document.getElementById(`stop-${id}`);row?.scrollIntoView({block:'nearest',behavior:'auto'});row?.querySelector<HTMLElement>('.it-lock-note button,.it-stop-edit input:not(:disabled)')?.focus({preventScroll:true})})}
 const replace=(stop:PlanStop)=>{setReplaceId(stop.id);setLocationId('');setAddMode(stop.kind==='EVENT'?'EVENT':stop.source==='MANUAL'?'MANUAL':'PLACES')}
 const beginAdd=(mode:AddMode)=>{setReplaceId('');setLocationId('');setAddMode(mode);setMessage('')}
 const locate=(id:string)=>{setLocationId(id);setReplaceId('');setAddMode('LOCATE')}
 const requestNew=()=>dirty||wizardDraft||draft?setResetOpen(true):newPlan()
 const chooseEvent=(row:PublicEventSummary,day=plan.day)=>{
  setDuration(categoryForType(row.event.subcategory).code==='POPUP'||row.event.subcategory==='BIRTHDAY_CAFE'?60:180)
  setAnchor(row);setMessage('')
  const from=row.event.occurrences.find(o=>o.startDate<=day&&o.endDate>=day)?.startTime?.slice(0,5)||plan.start
  setAnchorTime(from)
  if(day!==plan.day)patch({day})
  if(plan.purpose==='EVENT'&&timeMinutes(from)<timeMinutes(plan.start))patch({start:from})
 }
 const chooseRegion=(id:string)=>{if(id===plan.area){go(3);return}patch({area:id,interests:undefined,stops:[]});setAnchor(null);setPlaces([]);setEventQuery('');setField('ALL');go(3)}
 const changeDay=(day:string)=>{if(day===plan.day)return;patch({day,stops:[]});setAnchor(null);setPlaces([])}
 const readyTime=Number.isFinite(timeMinutes(plan.start))&&Number.isFinite(timeMinutes(plan.end))&&timeMinutes(plan.end)>timeMinutes(plan.start)
 if(!owner||!personal.ready)return <section className="it-page"><h1>내 일정</h1>{personal.state.status==='error'||auth.status==='error'?<div role="alert"><p>{personal.state.error||auth.error}</p><button className="btn secondary" onClick={()=>void (owner?personal.store.refresh():auth.refresh())}>다시 확인</button></div>:<p role="status">저장한 일정을 확인하고 있어요.</p>}</section>
 const steps=['목적','날짜','지역','행사','같이 갈 곳','시간 확인','완성']
 const quickDays=[0,1,(6-new Date(`${seoulToday()}T12:00:00Z`).getUTCDay()+7)%7].map(offset=>{const d=new Date(`${seoulToday()}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10)})
 return <section className={`it-page${step===6?' is-editing':step===7?' is-complete':''}`} aria-busy={personal.state.busy}><div className="it-private-content" inert={personal.state.busy||importing||undefined}>
  {step!==7&&<header className="it-heading">
   <div><h1 ref={heading} tabIndex={-1}>{step<0?'내 일정':step===6?'나의 하루 일정':'일정 만들기'}</h1><p>{step===6?'전체 코스를 확인하고, 필요한 장소만 눌러 수정하세요.':'행사를 중심으로, 또는 함께 보낼 하루를 계획하세요.'}</p></div>
   <div className="it-heading-actions">{(step===6||step<0)&&<button className="btn secondary" onClick={requestNew}>새 일정</button>}<Link className="it-back" to="/library">내 보관함 <DiscoveryIcon name="arrow" size={15}/></Link></div>
  </header>}
  {step>=0&&step<6&&<><ol className="it-progress it-wizard-progress" aria-label="일정 만들기 단계">{steps.map((label,i)=><li key={label} className={i===step?'current':i<step?'done':''} aria-current={i===step?'step':undefined}><span>{i<step?<DiscoveryIcon name="check" size={13}/>:i+1}</span>{label}</li>)}</ol><div className="it-mobile-progress"><span>{step+1} / {steps.length}</span><strong>{steps[step]}</strong><div><span style={{width:`${(step+1)/steps.length*100}%`}}/></div></div></>}
  {discardingLocal&&<Modal title="이 기기 일정에서 제외할까요?" close={()=>setDiscardingLocal(null)}><p>{discardingLocal.title}</p><p>이 기기의 원본 일정만 제거해요. 계정에 저장한 일정은 유지돼요.</p><div className="it-dialog-actions"><button className="btn secondary" onClick={()=>setDiscardingLocal(null)}>취소</button><button className="btn primary" onClick={()=>void discardLocal(discardingLocal)}>기기에서 제외</button></div></Modal>}{saveConflict&&<div className="it-import-panel"><p>작성한 내용은 유지했어요. 최신 일정과 비교하거나 새 일정으로 저장할 수 있어요.</p><button className="btn secondary" onClick={()=>{setLatestOpen(true);void personal.store.refresh()}}>계정의 최신 일정 보기</button><button className="btn secondary" onClick={()=>{setPlan(p=>({...p,id:crypto.randomUUID()}));setPlanRevision(0);setSavedSignature('');setSaveConflict(false);setMessage('새 일정으로 저장할 준비가 됐어요. 일정 저장을 눌러 주세요.')}}>이 내용으로 새 일정 만들기</button></div>}{message&&<p className={`it-message${(saveConflict||/못|저장 공간/.test(message))?' is-error':''}`} role={(saveConflict||/못|저장 공간/.test(message))?'alert':'status'}>{message}</p>}
  {!owner?<p role="status">계정 상태를 확인하고 있어요.{auth.status==='error'&&<button className="btn secondary" onClick={()=>void auth.refresh()}>다시 확인</button>}</p>:step===7?<SaveComplete account={owner.startsWith('member:')} plan={plan} areaName={areaName} headingRef={heading} open={()=>restore(draft?.id===plan.id?draft:plan)} share={()=>setShareOpen(true)} list={()=>go(-1)}/>:step<0?<><p className="it-storage-note">{owner==='guest'?'이 브라우저에 저장한 일정이에요. 로그인하면 계정에 가져올 수 있어요.':'계정에 저장한 일정이에요. 다른 기기에서도 로그인하면 이어서 볼 수 있어요.'}</p>{owner.startsWith('member:')&&<button className="btn secondary" disabled={importing} onClick={()=>void personal.store.refresh()}>최신 목록 확인</button>}{personal.state.local.length>0&&<LocalPlans rows={personal.state.local} issues={importIssues} busy={importing} importAll={()=>void importLocal()} importOne={(p,newCopy)=>void importLocal(p,newCopy)} discard={setDiscardingLocal}/>}{wizardDraft&&<div className="it-resume"><div><strong>작성하던 일정 이어서 만들기</strong><p>{wizardDraft.plan.day} · {regionArea(wizardDraft.plan.area)?.name||'지역 선택 전'}</p></div><button className="btn secondary" onClick={()=>resumeWizard(wizardDraft)}>이어서 만들기</button></div>}{draft&&<div className="it-resume"><div><strong>저장 전 수정사항</strong><p>{draft.title||'작성 중인 일정'}</p></div><button className="btn secondary" onClick={()=>restore(draft)}>일정 열기</button></div>}<SavedPlans rows={saved} open={restore} remove={id=>{const currentScope=storageKey;void personal.store.remove(id).catch(e=>{if(scope.current===currentScope)setMessage(e instanceof Error?e.message:'일정을 삭제하지 못했어요.')})}}/>{!saved.length&&!draft&&!wizardDraft&&<div className="it-empty"><h2>가고 싶은 곳으로 하루를 만들어보세요</h2><button className="btn primary" onClick={newPlan}>새 일정 만들기</button></div>}</>:step===0?<>
   <h2 className="it-purpose-heading">어떤 일정으로 시작할까요?</h2>
   <div className="it-purpose-grid">
    <PurposeCard icon="ticket" title="행사 참여" text="방문할 날짜와 지역의 행사를 살펴보고, 근처 식사와 카페를 더해요." action="방문 날짜 고르기" onClick={()=>{patch({purpose:'EVENT',start:'10:00',style:'VIEW'});go(1)}}/>
    <PurposeCard icon="sparkles" title="데이트" text="날짜와 동네를 고르면 행사·식사·카페 코스를 만들어요." action="만날 날짜 고르기" onClick={()=>{patch({purpose:'DATE',start:'13:00',style:'CONTENT',interests:undefined});go(1)}}/>
   </div>
   <div className="it-setup-actions"><button className="btn secondary" onClick={()=>go(-1)}>내 일정</button></div>
  </>:step<6?<div className={`it-wizard step-${step}`}>
   <div className="it-wizard-context"><span className="it-badge">{plan.purpose==='EVENT'?'행사 참여':'데이트'}</span>{step>1&&<button disabled={busy} onClick={()=>go(1)}>{plan.day.slice(5).replace('-','.')} <span>날짜 변경</span></button>}{step>2&&<button disabled={busy} onClick={()=>go(2)}>{areaName} <span>지역 변경</span></button>}</div>
   {step===1?<div className="it-wizard-date">
    <h2>언제 가볼까요?</h2><p>그날 열리는 행사부터 찾아볼게요.</p>
    <label>방문 날짜<input className="input" type="date" min={seoulToday()} value={plan.day} onInput={e=>changeDay(e.currentTarget.value)}/></label>
    <div className="it-date-shortcuts">{['오늘','내일','이번 토요일'].map((label,i)=><button key={label} aria-pressed={plan.day===quickDays[i]} onClick={()=>changeDay(quickDays[i])}>{label}<small>{quickDays[i].slice(5).replace('-','.')}</small></button>)}</div>
    <div className="it-setup-actions"><button className="btn secondary" onClick={()=>go(0)}>이전</button><button className="btn primary" disabled={!validDay(plan.day)||plan.day<seoulToday()} onClick={()=>go(2)}>지역 살펴보기 <DiscoveryIcon name="arrow" size={17}/></button></div>
   </div>:step===2?<>
    <div className="it-wizard-title"><h2>어느 지역이 끌리세요?</h2><p>지역을 누르면 그날 열리는 서브컬처·박람회·축제·팝업을 볼 수 있어요.</p></div>
    {data.loading?<div className="it-wizard-loading" role="status">지역별 행사를 확인하고 있어요…</div>:data.error?<div className="it-wizard-empty" role="alert"><h3>지역별 행사를 불러오지 못했어요</h3><p>연결을 확인하고 다시 시도해 주세요.</p><button className="btn secondary" onClick={()=>void data.reload()}>다시 불러오기</button></div>:<RegionPicker value={plan.area} counts={counts.counts} choose={chooseRegion}/>}
    {!data.loading&&!data.error&&<p className="it-wizard-note">{plan.day}에 열리는 공개 행사 기준{counts.unlocated>0&&<> · 주소 확인 중인 행사는 <button className="it-unlocated" onClick={()=>chooseRegion('UNLOCATED')}>따로 볼 수 있어요 ({counts.unlocated}개) →</button></>}</p>}
    <div className="it-setup-actions"><button className="btn secondary" onClick={()=>go(1)}>이전</button></div>
   </>:step===3?<>
    <div className="it-wizard-title"><h2>{areaName}에서 가볼 행사</h2><p>{plan.purpose==='EVENT'?'가고 싶은 행사를 먼저 골라주세요.':'같이 가보고 싶은 행사를 골라주세요.'} 식사·카페는 다음 단계에서 더해요.</p></div>
    {!anchor&&<div className="it-setup-actions"><button className="btn secondary" onClick={()=>go(2)}>이전</button></div>}
   {anchor&&<div className="it-wizard-selection"><div role="status"><small>선택한 행사</small><strong>{anchor.event.name}</strong></div><div className="it-setup-actions"><button className="btn secondary" onClick={()=>go(2)}>이전</button><button className="btn primary" disabled={!anchor||data.loading||!!data.error||!operatingOn(anchor,plan.day).length} onClick={()=>go(4)}>같이 갈 곳 고르기 <DiscoveryIcon name="arrow" size={17}/></button></div></div>}
    {data.loading?<p className="it-wizard-loading" role="status">이 날짜의 행사를 확인하고 있어요…</p>:data.error?<div className="it-wizard-empty" role="alert"><p>행사 목록을 불러오지 못했어요.</p><button className="btn secondary" onClick={()=>void data.reload()}>다시 불러오기</button></div>:<EventPicker rows={anchorRows} allRows={localRows} field={field} setField={setField} query={eventQuery} setQuery={setEventQuery} anchor={anchor} choose={chooseEvent} topics={localTopics} interests={plan.interests} changeTopics={interests=>patch({interests})} preview={setPreview} topicLoading={topicData.loading} topicError={topicData.error?.message||null} retryTopics={()=>void topicData.reload()} day={plan.day}/>}
    {!data.loading&&!data.error&&!anchorRows.length&&nextMatches.length>0&&<div className="it-next-matches"><h4>이 지역의 다른 날짜 행사</h4>{nextMatches.map(({row,day})=><button type="button" key={row.id} onClick={()=>chooseEvent(row,day)}><span>{day.slice(5).replace('-','.')}</span><strong>{row.event.name}</strong><small>이 날짜로 선택 →</small></button>)}</div>}
    {!data.loading&&!data.error&&!localRows.length&&<><div className="it-next-matches"><h4>다른 날짜도 살펴보세요</h4>{alternativeDates.loading?<p role="status">앞으로 2주간 이 지역의 행사를 확인하고 있어요…</p>:alternativeDates.error?<p>다른 날짜의 행사를 확인하지 못했어요. <button onClick={()=>void alternativeDates.reload()}>다시 확인</button></p>:(alternativeDates.data||[]).map(({row,day})=><button key={row.id} onClick={()=>chooseEvent(row,day)}><span>{day.slice(5).replace('-','.')}</span><strong>{row.event.name}</strong><small>이 날짜로 선택 →</small></button>)}</div><div className="it-active-regions"><strong>이 날짜에 행사가 있는 다른 지역</strong><div>{areas.filter(a=>a.id.includes('_')&&counts.counts[a.id]).sort((a,b)=>distance(area.point,a.point)-distance(area.point,b.point)).slice(0,3).map(a=><button key={a.id} onClick={()=>chooseRegion(a.id)}>{a.name}<span>{counts.counts[a.id]}개</span></button>)}</div></div></>}
    {plan.purpose==='DATE'&&regionArea(plan.area)&&<button className="it-skip-event" onClick={()=>{setAnchor(null);patch({style:'RELAXED'});go(4)}}>행사 없이 식사·카페로 만들기 <DiscoveryIcon name="arrow" size={15}/></button>}

   </>:step===4?<>
    <div className="it-wizard-title"><h2>같이 갈 곳을 골라볼까요?</h2><p>식사·카페를 고르거나, 가고 싶은 곳을 직접 넣으세요. {anchor?'추가하지 않고 넘어가도 좋아요.':'한 곳 이상 골라 코스를 시작하세요.'}</p></div>
    {anchor&&<div className="it-course-anchor"><ContentImage url={anchor.banner?.url} kind="event" eventType={anchor.event.subcategory} alt=""/><div><small>중심 행사</small><strong>{anchor.event.name}</strong></div><button onClick={()=>go(3)}>변경</button></div>}
    <div className="it-add-choices"><button onClick={()=>{setPlaceKind('FOOD');beginAdd('PLACES')}}>＋ 식사</button><button onClick={()=>{setPlaceKind('CAFE');beginAdd('PLACES')}}>＋ 카페</button><button onClick={()=>beginAdd('MANUAL')}>＋ 직접 입력</button></div>
    {anchorPoint.loading&&<p role="status">행사장 위치를 확인하고 있어요…</p>}{anchor&&!anchorPoint.loading&&!nearbyCenter&&<p className="it-check-note">행사장 위치를 확인하지 못했어요. 주변 장소 대신 직접 가고 싶은 곳을 입력할 수 있어요.</p>}
    {busy&&!anchor&&<p role="status">선택한 행사를 불러오고 있어요…</p>}
    <div className="it-companions">{plan.stops.map(stop=><article key={stop.id}><span className="it-badge">{kindNames[stop.kind]}</span><div><strong>{stop.name}</strong><p>{stop.address||'주소 확인 필요'}</p></div><button aria-label={`${stop.name} 선택 취소`} onClick={()=>patch({stops:plan.stops.filter(s=>s.id!==stop.id)})}>×</button></article>)}</div>
    <div className="it-setup-actions"><button className="btn secondary" onClick={()=>go(3)}>이전</button><button className="btn primary" disabled={busy||(!anchor&&!plan.stops.length)} onClick={()=>go(5)}>{plan.stops.length?'시간 확인하기':anchor?'행사만으로 진행':'장소를 먼저 골라주세요'} <DiscoveryIcon name="arrow" size={17}/></button></div>
   </>:<>
    <div className="it-wizard-title"><h2>시간을 맞춰볼까요?</h2><p>머무를 시간과 하루의 시작·마무리를 정하세요.</p></div>
    <fieldset className="it-setup-fields" disabled={busy}>
     <div className="it-course-anchor">{anchor?<><ContentImage url={anchor.banner?.url} kind="event" eventType={anchor.event.subcategory} alt=""/><div><small>{categoryForType(anchor.event.subcategory).label} · {plan.day}</small><strong>{anchor.event.name}</strong><span>{anchor.event.venueName||anchor.event.address||'장소 확인 필요'}</span></div></>:<div><small>{areaName}</small><strong>식사와 카페로 채우는 하루</strong></div>}<button onClick={()=>go(3)}>변경</button></div>
     {anchor&&<label className="it-duration">행사에 머무를 시간<select className="select" value={duration} onChange={e=>setDuration(Number(e.target.value))}>{[30,60,90,120,180,240,300,360,480].map(n=><option key={n} value={n}>{n>=60?`${Math.floor(n/60)}시간${n%60?' 30분':''}`:'30분'}</option>)}</select></label>}
     <div className="it-form-grid"><label>하루 시작<input className="input" type="time" value={plan.start} onInput={e=>patch({start:e.currentTarget.value})}/></label><label>하루 마무리<input className="input" type="time" value={plan.end} onInput={e=>patch({end:e.currentTarget.value})}/></label></div>
     {plan.purpose==='EVENT'&&anchor&&<label className="it-arrival"><span>행사 도착 예정 시간<small>코스에서 이 시간을 고정해요.</small></span><input className="input" type="time" value={anchorTime} onInput={e=>setAnchorTime(e.currentTarget.value)}/></label>}
     {!readyTime&&<p className="it-field-error" role="alert">마무리를 시작 시간 이후로 설정해 주세요.</p>}
     <p className="it-wizard-note">{anchor?'중심 행사 + ':''}선택한 장소 {plan.stops.length}곳 · 장소 사이에는 30분의 여유를 두어요. 실제 이동 시간은 지도에서 확인해 주세요.</p>
     <p className="it-storage-note">{owner==='guest'?'일정은 이 브라우저에 저장돼요. 로그인하면 계정에 가져올 수 있어요.':'일정은 내 계정에 저장돼요. 저장 후 다른 기기에서도 이어서 볼 수 있어요.'}</p>
     <div className="it-setup-actions"><button className="btn secondary" onClick={()=>go(4)}>이전</button><button className="btn primary" onClick={()=>void generate()} disabled={busy||data.loading||!!data.error||!validDay(plan.day)||!readyTime||(!plan.area&&!anchor)||(!anchor&&!plan.stops.length)||(anchor&&!operatingOn(anchor,plan.day).length)||(plan.purpose==='EVENT'&&(!anchor||!Number.isFinite(timeMinutes(anchorTime))))}>{busy?'코스 만드는 중…':'코스 만들기'}<DiscoveryIcon name="arrow" size={17}/></button></div>
    </fieldset>
   </>}
  </div>:<>
   <div className="it-plan-bar">
    <label className="it-title-input"><span>일정 이름</span><input maxLength={120} value={plan.title} placeholder="일정 이름을 입력하세요" onChange={e=>patch({title:e.target.value})}/></label>
    <label className="it-plan-date">방문 날짜<input className="input" type="date" value={plan.day} onInput={e=>{patch({day:e.currentTarget.value,stops:plan.stops.map(s=>s.eventId?{...s,url:`/discover/${s.eventId}?day=${e.currentTarget.value}`}:s)});setMessage('방문 날짜를 바꿨어요. 행사 운영 날짜와 시간을 다시 확인해 주세요.')}}/></label>
    <div className="it-plan-summary"><span className="it-badge">{plan.purpose==='EVENT'?'행사 참여':'데이트'}</span><strong>{plan.stops.length}곳</strong><span>{plan.purpose==='EVENT'?(areas.find(a=>a.id===plan.area)?.name||'행사장 위치 기준'):area.name}</span></div>
   </div>
   <div className="it-mobile-tabs" role="group" aria-label="일정 보기"><button aria-pressed={view==='list'} onClick={()=>setView('list')}><DiscoveryIcon name="calendar" size={17}/> 일정</button><button aria-pressed={view==='map'} onClick={()=>setView('map')}><DiscoveryIcon name="pin" size={17}/> 지도</button></div>
   <div className={`it-editor view-${view}`}>
    <div className="it-timeline">
     <div className="it-timeline-top"><h2>방문 순서</h2><div className="it-schedule-tools"><button disabled={!undoPlan} onClick={()=>{if(undoPlan){setPlan(undoPlan);setUndoPlan(null);setMessage('이전 내용으로 되돌렸어요.')}}}>되돌리기</button><button onClick={()=>{const next=fitTimes(plan);patch({stops:next.stops});setMessage(planIssues(next).length?'시간을 맞췄어요. 남은 확인 항목을 살펴보세요.':'고정한 시간을 유지하며 방문 시간을 맞췄어요.')}}>시간 맞추기</button></div></div>
     <details className="it-day-settings"><summary><span>하루 시간</span><strong>{plan.start}–{plan.end}</strong><span>변경</span></summary><div className="it-day-range"><label>시작<input type="time" value={plan.start} onInput={e=>patch({start:e.currentTarget.value})}/></label><span>—</span><label>마무리<input type="time" value={plan.end} onInput={e=>patch({end:e.currentTarget.value})}/></label></div></details>
     {issues.length>0&&<div className="it-conflicts" role="status"><strong><DiscoveryIcon name="info" size={17}/> 시간 확인 {issues.length}건</strong><p>저장은 가능해요. 캘린더에 넣기 전에 시간을 맞춰 주세요.</p><ul>{issueDetails.map((issue,i)=><li key={`${issue.stopId}-${i}`}>{issue.stopId?<button onClick={()=>edit(issue.stopId!)}>{issue.message}<span>수정 →</span></button>:issue.message}</li>)}</ul></div>}
     {plan.stops.map((s,i)=><ItineraryStop key={s.id} stop={s} index={i} count={plan.stops.length} day={plan.day} selected={s.id===selected} expanded={s.id===editingId} issues={issueDetails.filter(issue=>issue.stopId===s.id).map(issue=>issue.message)} select={()=>setSelected(s.id)} toggle={()=>{setSelected(s.id);setEditingId(s.id===editingId?'':s.id)}} change={change=>editStop(s.id,change)} main={s.id===(plan.stops.find(s=>s.kind==='EVENT')?.id||'')} mobileClose={()=>setEditingId('')} replace={()=>replace(s)} move={offset=>{patch({stops:moveStop(plan.stops,s.id,offset)});setSelected(s.id)}} remove={()=>{patch({stops:plan.stops.filter(x=>x.id!==s.id)});setEditingId('');setSelected(plan.stops.find(x=>x.id!==s.id)?.id||'')}} locate={()=>locate(s.id)}/>)}
     {!plan.stops.length&&<div className="it-empty"><h3>가고 싶은 곳을 추가해 주세요</h3><p>공개 행사나 직접 입력한 장소로 시작할 수 있어요.</p></div>}
     <div className="it-add-choices it-list-add"><button onClick={()=>beginAdd('EVENT')}>＋ 행사</button><button onClick={()=>{setPlaceKind('FOOD');beginAdd('PLACES')}}>＋ 식사</button><button onClick={()=>{setPlaceKind('CAFE');beginAdd('PLACES')}}>＋ 카페</button><button onClick={()=>beginAdd('MANUAL')}>＋ 직접 입력</button></div>

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
   <div className="it-save-bar"><div><strong>{dirty?'아직 저장하지 않은 변경사항이 있어요':savedSignature?'저장된 일정이에요':'아직 저장 전이에요'}</strong><span>{owner==='guest'?'이 브라우저에 저장':'내 계정에 저장'} · 저장 후에도 수정 가능</span></div><details className="it-more-actions"><summary aria-label="일정 더보기">···</summary><button className="it-calendar" aria-label="캘린더 내보내기" disabled={!plan.stops.length||!!issues.length} title={issues.length?'시간 확인 항목을 수정하면 내보낼 수 있어요':undefined} onClick={download}><DiscoveryIcon name="download" size={17}/><span>캘린더 내보내기</span></button><button className="it-my-plans" onClick={()=>go(-1)}>내 일정 목록</button></details><button className="btn secondary it-share-button" disabled={!plan.stops.length||!validDay(plan.day)} onClick={()=>setShareOpen(true)}>공유</button><button className="btn primary" disabled={!plan.stops.length||!validDay(plan.day)|| (!!savedSignature&&!dirty)} onClick={()=>void save()}>{savedSignature&&!dirty?'저장 완료':'일정 저장'}</button></div>
  </>}
  {preview&&<EventPreview row={preview} day={plan.day} close={()=>setPreview(null)} choose={()=>{chooseEvent(preview);setPreview(null)}}/>}
  {addMode&&<PlaceDialog kind={placeKind} setKind={setPlaceKind} replacing={!!replaceId} mode={addMode} setMode={setAddMode} close={()=>{setAddMode(null);setReplaceId('');setLocationId('')}} center={center} events={candidates.filter(c=>replaceId||!plan.stops.some(s=>s.eventId===c.row.id)).map(c=>c.row)} places={visiblePlaces} busy={busy} error={placeError} loadNearby={()=>void loadNearby()} addEvent={insertEvent} addPlace={insertPlace} addManual={addStop} locateStop={plan.stops.find(s=>s.id===locationId)} locatePoint={point=>{editStop(locationId,{point});setAddMode(null);setLocationId('');setMessage('선택한 위치를 지도에 표시했어요.')}}/>}
  {shareOpen&&owner&&scope.current===storageKey&&<ShareDialog key={`${owner}:${plan.id}`} plan={plan} owner={owner} close={()=>setShareOpen(false)}/>}
  {latestOpen&&<Modal title="계정의 최신 일정" close={()=>setLatestOpen(false)}><p>확인하는 동안 작성 중인 내용은 그대로 유지됩니다.</p>{personal.state.status==='loading'?<p role="status">최신 일정을 불러오고 있어요.</p>:personal.state.error?<p role="alert">{personal.state.error}</p>:saved.find(p=>p.id===plan.id)?(()=>{const latest=saved.find(p=>p.id===plan.id)!;return <><h3>{latest.title||'이름 없는 일정'}</h3><p>{latest.day} · {latest.start} ~ {latest.end}</p><ol>{latest.stops.map(s=><li key={s.id}>{s.start} · {s.name} · {s.duration}분{s.note&&<p>{s.note}</p>}</li>)}</ol><p>아래 교체 버튼을 누르면 현재 작성 중인 내용을 버리고 최신 일정으로 바꿉니다.</p><button className="btn secondary" onClick={()=>{setLatestOpen(false);restore(latest)}}>작성 내용을 버리고 최신 일정으로 교체</button></>})():<p>계정에서 해당 일정을 찾지 못했어요. 작성 중인 내용은 새 일정으로 저장할 수 있어요.</p>}<div className="it-dialog-actions"><button className="btn primary" onClick={()=>setLatestOpen(false)}>작성 중인 일정으로 돌아가기</button></div></Modal>}
  {resetOpen&&<Modal title="새 일정을 만들까요?" close={()=>setResetOpen(false)}><p>작성 중인 내용은 새로 시작하면 초기화됩니다. 저장한 일정은 내 일정에 남아 있어요.</p><div className="it-dialog-actions"><button className="btn secondary" onClick={()=>setResetOpen(false)}>계속 수정</button><button className="btn primary" onClick={()=>{setResetOpen(false);newPlan()}}>새로 만들기</button></div></Modal>}
 </div>{personal.state.busy&&<p className="it-save-feedback" role="status">저장 내용을 반영하고 있어요.</p>}</section>
}

function readDraftRevision(key:string){try{const revision=Number(localStorage.getItem(`${key}:revision`)||0);return Number.isSafeInteger(revision)&&revision>=0?revision:0}catch{return 0}}
function PurposeCard({icon,title,text,action,onClick}:{icon:'ticket'|'sparkles';title:string;text:string;action:string;onClick:()=>void}){return <button className="it-purpose" onClick={onClick}><span className="it-purpose-top"><DiscoveryIcon name={icon} size={24}/><h3>{title}</h3></span><p>{text}</p><span className="it-purpose-bottom"><strong>{action}</strong><DiscoveryIcon name="arrow" size={20}/></span></button>}
function SavedPlans({rows,open,remove}:{rows:Plan[];open:(p:Plan)=>void;remove:(id:string)=>void}){const [deleting,setDeleting]=useState<Plan|null>(null);return <div className="it-saved"><h2>내 일정 <span>{rows.length}</span></h2>{rows.length?<div className="it-saved-grid">{rows.map(p=><article key={p.id}><small>{p.day} · {p.purpose==='EVENT'?'행사 참여':'데이트'}</small><h3>{p.title}</h3><p>{p.stops.length}곳 · {p.start}–{p.end}</p><div><button onClick={()=>open(p)}>열고 수정하기 <DiscoveryIcon name="arrow" size={15}/></button><button onClick={()=>setDeleting(p)}>삭제</button></div></article>)}</div>:<p>만든 일정을 저장하면 이 브라우저에서 다시 열 수 있어요.</p>}{deleting&&<Modal title="이 일정을 삭제할까요?" close={()=>setDeleting(null)}><p>{deleting.title}</p><div className="it-dialog-actions"><button className="btn secondary" onClick={()=>setDeleting(null)}>취소</button><button className="btn primary" onClick={()=>{remove(deleting.id);setDeleting(null)}}>삭제</button></div></Modal>}</div>}
function LocalPlans({rows,issues,busy,importOne,importAll,discard}:{rows:Plan[];issues:Record<string,ImportIssue>;busy:boolean;importOne:(p:Plan,newCopy?:boolean)=>void;importAll:()=>void;discard:(p:Plan)=>void}){
 return <section className="it-import-panel"><h2>이 기기에 남아 있는 일정 {rows.length}개</h2><p>비회원으로 만든 일정도 포함돼요. 계정 일정은 그대로 두고 새 일정으로 가져와요.</p><button className="btn primary" disabled={busy} onClick={importAll}>{busy?'가져오는 중…':'모두 계정으로 가져오기'}</button><div className="it-saved-grid">{rows.map(p=>{const key=JSON.stringify(p),issue=issues[key];return <article key={key}><small>{p.day.replace(/-/g,'.')}</small><h3>{p.title}</h3><p>{p.stops.length}곳 · {p.start}–{p.end}</p><div style={{flexWrap:'wrap',gap:12}}><button disabled={busy} onClick={()=>importOne(p)}>{issue?'다시 가져오기':'계정으로 가져오기'}</button>{issue?.deleted&&<button disabled={busy} onClick={()=>importOne(p,true)}>새 사본으로 가져오기</button>}<button disabled={busy} onClick={()=>discard(p)}>기기에서 제외</button></div>{issue&&<p role="alert" style={{gridColumn:'1/-1'}}>{issue.message}{issue.deleted&&' 계정에서 삭제한 일정은 그대로 두고, 새 사본으로 가져올 수 있어요.'}</p>}</article>})}</div></section>
}
function Modal({title,close,children}:{title:string;close:()=>void;children:ReactNode}){const titleId=useId(),dialog=useRef<HTMLDialogElement>(null),closeRef=useRef(close);closeRef.current=close;useEffect(()=>{const el=dialog.current!;return openCatalogDialog(el,el.querySelector<HTMLElement>('h2'),document.activeElement as HTMLElement)},[]);return <dialog ref={dialog} className="it-dialog" aria-labelledby={titleId} onCancel={e=>{e.preventDefault();closeRef.current()}}><header><h2 id={titleId} tabIndex={-1}>{title}</h2><button aria-label="창 닫기" onClick={close}><DiscoveryIcon name="close"/></button></header><div className="it-dialog-body">{children}</div></dialog>}
function PlaceDialog({kind:filterKind,setKind:filterKindSet,replacing=false,mode,setMode,close,center,events,places,busy,error,loadNearby,addEvent,addPlace,addManual,locateStop,locatePoint}:{kind:StopKind;setKind:(kind:StopKind)=>void;replacing?:boolean;mode:AddMode;setMode:(m:AddMode)=>void;close:()=>void;center:Point;events:PublicEventSummary[];places:Place[];busy:boolean;error:string;loadNearby:()=>void;addEvent:(r:PublicEventSummary)=>void;addPlace:(p:Place)=>void;addManual:(p:PlanStop)=>void;locateStop?:PlanStop;locatePoint:(p:Point)=>void}){
 const [query,setQuery]=useState(locateStop?.address||locateStop?.venueName||''),[name,setName]=useState(''),[address,setAddress]=useState(''),[kind,setKind]=useState<StopKind>('PLACE'),[point,setPoint]=useState<Point|null>(null),[searching,setSearching]=useState(false),[results,setResults]=useState<Place[]>([]),[searchError,setSearchError]=useState(''),[chosenPlace,setChosenPlace]=useState<Place|null>(null)
 const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 const search=async()=>{setSearching(true);setSearchError('');try{const result=await searchPlaces(query,center);if(alive.current)setResults(result)}catch(e){if(alive.current)setSearchError(e instanceof Error?e.message:'검색하지 못했어요.')}finally{if(alive.current)setSearching(false)}}
 const draftStop:PlanStop={id:'location-preview',kind,name:locateStop?.name||name||'선택한 위치',address,point,start:'13:00',duration:60,locked:false,note:'',url:'',source:'MANUAL'}
 return <Modal title={mode==='LOCATE'?'지도 위치 확인':replacing?'장소 바꾸기':'장소 추가'} close={close}>{replacing&&<p className="it-check-note">장소를 바꿔도 기존 방문 시간은 유지돼요.</p>}{mode!=='LOCATE'&&<div className="it-dialog-tabs">{([['EVENT','공개 행사'],['PLACES','음식점·카페'],['MANUAL','직접 입력']] as [AddMode,string][]).map(([m,label])=><button key={m} aria-pressed={mode===m} onClick={()=>setMode(m)}>{label}</button>)}</div>}
 {mode==='EVENT'?<><input className="input" aria-label="추가할 행사 검색" value={query} onChange={e=>setQuery(e.target.value)} placeholder="선택한 날짜·동네의 행사 검색"/><div className="it-dialog-results">{events.filter(r=>r.event.name.includes(query)).map(row=><button className="it-result" key={row.id} onClick={()=>addEvent(row)}><ContentImage url={row.banner?.url} kind="event" eventType={row.event.subcategory} alt=""/><span><strong>{row.event.name}</strong><small>{row.event.venueName}</small></span><b>＋</b></button>)}{!events.filter(r=>r.event.name.includes(query)).length&&<p>조건에 맞는 추가 행사가 없어요. 직접 입력으로 가고 싶은 곳을 더할 수 있어요.</p>}</div></>:mode==='PLACES'?<><div className="it-choice it-place-kinds"><button aria-pressed={filterKind==='FOOD'} onClick={()=>filterKindSet('FOOD')}>식사</button><button aria-pressed={filterKind==='CAFE'} onClick={()=>filterKindSet('CAFE')}>카페</button></div><div className="it-nearby-search"><p>행사장·선택 지역 근처의 후보를 거리순으로 보여줘요.</p><button className="btn secondary" disabled={busy||!nearbyAvailable} onClick={loadNearby}>{busy?'확인 중…':places.length?'다시 확인':'주변 장소 찾기'}</button></div>{error&&<p role="alert">{error}</p>}<div className="it-dialog-results">{places.filter(p=>p.kind===filterKind).map(p=><button className="it-result" key={p.id} onClick={()=>addPlace(p)}><span className="it-result-kind">{p.kind==='FOOD'?'식사':'카페'}</span><span><strong>{p.name}</strong><small>직선거리 {((p.distance||0)*1000).toFixed(0)}m · 영업·예약 확인 필요</small></span><b>＋</b></button>)}</div><p className="it-check-note">{places.length>0&&<>{places.some(p=>p.provider==='KAKAO')?<a href="https://map.kakao.com/" target="_blank" rel="noopener noreferrer">카카오맵 장소 정보</a>:'OpenStreetMap 장소 정보'} · </>}인기·평점 순위가 아닙니다.</p><button className="it-locate" onClick={()=>{setKind(filterKind);setMode('MANUAL')}}>가고 싶은 {filterKind==='CAFE'?'카페':'음식점'} 검색·직접 입력</button></>:<>
 {mode==='LOCATE'&&<p className="it-check-note">{locateStop?.name}<br/>{locateStop?.address}<br/>검색 결과를 확인하거나 지도에서 행사장의 정확한 위치를 골라 주세요.</p>}
 {placeSearchAvailable&&<><form className="it-location-search" onSubmit={e=>{e.preventDefault();void search()}}><input className="input" aria-label="지도 장소 검색" value={query} onChange={e=>setQuery(e.target.value)} placeholder="장소 이름 또는 주소"/><button className="btn secondary" disabled={searching||query.trim().length<2}>{searching?'검색 중…':'검색'}</button></form>{searchError&&<p role="alert">{searchError}</p>}{results.length>0&&<div className="it-search-results">{results.map(p=><button key={p.id} onClick={()=>{setPoint(p.point);if(mode==='MANUAL'){setName(p.name);setAddress(p.address);setChosenPlace(p)}}}><strong>{p.name}</strong><small>{p.address}</small><span>위치 선택</span></button>)}</div>}{!searching&&!results.length&&searchError===''&&query&&<p className="it-check-note">검색 결과를 확인한 뒤 위치를 선택하세요.</p>}</>}
 {mode==='MANUAL'&&<div className="it-form-grid"><label>장소 이름<input className="input" value={name} maxLength={200} onChange={e=>{setName(e.target.value);setChosenPlace(null)}} placeholder="가고 싶은 장소"/></label><label>종류<select className="select" value={kind} onChange={e=>setKind(e.target.value as StopKind)}>{(['PLACE','FOOD','CAFE'] as StopKind[]).map(k=><option value={k} key={k}>{kindNames[k]}</option>)}</select></label><label className="it-form-wide">주소<input className="input" value={address} maxLength={400} onChange={e=>{setAddress(e.target.value);setChosenPlace(null)}} placeholder="공개된 주소를 입력하세요"/></label></div>}
 <div className="it-picker"><ItineraryMap stops={point?[draftStop]:[]} selected="location-preview" center={center} onSelect={()=>{}} onPick={point=>{setPoint(point);setChosenPlace(null)}} picking/></div><p className="it-check-note">{point?'지도 위치를 선택했어요. 주소와 같은 장소인지 확인해 주세요.':'지도에서 위치를 누르면 핀이 표시됩니다.'}</p><div className="it-dialog-actions"><button className="btn secondary" onClick={close}>취소</button><button className="btn primary" disabled={mode==='LOCATE'?!point:!name.trim()} onClick={()=>{if(mode==='LOCATE'&&point)locatePoint(point);else if(mode==='MANUAL')addManual(manualPlaceStop({...draftStop,id:crypto.randomUUID(),name:name.trim(),address:address.trim()},chosenPlace))}}>{mode==='LOCATE'?'이 위치로 표시':replacing?'이 장소로 바꾸기':'일정에 추가'}</button></div><small className="it-source-label">{results.length>0&&<>{results.some(p=>p.provider==='KAKAO')?<a href="https://map.kakao.com/" target="_blank" rel="noopener noreferrer">장소 검색: 카카오맵</a>:'장소 검색: OpenStreetMap / Photon'} · </>}위치는 선택한 내용으로 저장됩니다.</small>
 </>}</Modal>
}
