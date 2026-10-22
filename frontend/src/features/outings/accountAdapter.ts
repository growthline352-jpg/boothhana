import type { Plan as AccountPlan } from '../itinerary/model'
import { safeShareUrl } from '../itinerary/sharing'
import { clock, schedule, validPlan, type Plan, type PlaceKind } from './model'

/** One API document, with no guessed times or duplicate private snapshots. */
export function toAccountPlan(plan:Plan,base?:AccountPlan):AccountPlan {
 if(!validPlan(plan))throw new Error('일정 내용을 확인해 주세요.')
 return {version:1,id:plan.id,title:plan.title,purpose:base?.purpose??'DATE',day:plan.day,start:plan.start,end:plan.end,
  area:base?.area??'',style:base?.style??'CONTENT',updatedAt:plan.updatedAt,planner:'OUTINGS',interests:base?.interests,
  stops:schedule(plan).map(({stop,start})=>{
   if(start!==null&&start>=1440)throw Error('자정을 넘는 방문 시간이 있어요. 시간이나 이동시간을 조정한 뒤 저장해 주세요.')
   const p=stop.place,original=base?.stops.find(s=>s.id===stop.id)
   return {id:stop.id,kind:p.eventId?'EVENT':p.kind==='cafe'?'CAFE':p.kind==='food'?'FOOD':'PLACE',name:p.name,address:p.address,
    point:p.coordinates?{lat:p.coordinates[0],lng:p.coordinates[1]}:null,eventId:p.eventId,start:start===null?'':clock(start),duration:stop.duration,
    locked:original?.locked??false,note:stop.note,url:p.eventId?`/discover/${p.eventId}?day=${plan.day}`:safeShareUrl(original?.url??p.sourceUrl??''),
    image:p.image||undefined,occurrences:p.hours.map(h=>({startDate:h.from,endDate:h.to,startTime:h.open,endTime:h.close})),venueName:original?.venueName,
    openingHours:original?.openingHours,source:original?.source??(p.source==='catalog'?'CATALOG':'MANUAL'),
    outing:{placeId:p.id,kind:p.kind,area:p.area,description:p.description,tags:[...p.tags],cost:p.cost,indoor:p.indoor,booking:p.booking,source:p.source,
     sourceUrl:safeShareUrl(p.sourceUrl??'')||undefined,admission:p.admission,state:p.state,travel:stop.travel,fixed:stop.fixed,done:stop.done}}
  })}
}
export function fromAccountPlan(plan:AccountPlan):Plan {
 return {id:plan.id,title:plan.title,day:plan.day,start:plan.start,end:plan.end,updatedAt:plan.updatedAt,stops:plan.stops.map(s=>{
  const d=s.outing
  return {id:s.id,duration:s.duration,travel:d?.travel??null,fixed:d?d.fixed:s.start,note:s.note,done:d?.done??false,
   place:{id:d?.placeId??(s.eventId?`catalog-${s.eventId}`:s.id),eventId:s.eventId,name:s.name,kind:(d?.kind??(s.kind==='EVENT'?'event':s.kind==='CAFE'?'cafe':s.kind==='FOOD'?'food':'custom')) as PlaceKind,
    area:d?.area??'',address:s.address,description:d?.description??s.openingHours??'',image:s.image??'',tags:d?.tags??[],coordinates:s.point?[s.point.lat,s.point.lng]:undefined,
    hours:(s.occurrences??[]).map(o=>({from:o.startDate,to:o.endDate,open:o.startTime?.slice(0,5)||null,close:o.endTime?.slice(0,5)||null})),
    duration:s.duration,cost:d?.cost??null,indoor:d?.indoor??null,booking:d?.booking??'',source:d?.source??(s.source==='CATALOG'?'catalog':'custom'),
    sourceUrl:d?.sourceUrl??(s.url.startsWith('https://')?s.url:undefined),admission:d?.admission,state:d?.state}}
 })}
}
