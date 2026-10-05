import type {PublicEventSummary} from '../catalog/api'
import type {Occurrence} from '../collection/api'
import {categoryForType} from '../discovery/categories'
import {includesDay, validDay} from '../visit/visit'
import {matchesTopics,type TopicSelection} from './topics'
import {itineraryRegions,regionArea,regionForEvent} from './regionCatalog'

export type Purpose = 'EVENT' | 'DATE'
export type StopKind = 'EVENT' | 'FOOD' | 'CAFE' | 'PLACE'
export interface Point {lat:number;lng:number}
export interface PlanStop {
 id:string;kind:StopKind;name:string;address:string;point:Point|null;eventId?:number;
 start:string;duration:number;locked:boolean;note:string;url:string;image?:string;
 occurrences?:Occurrence[];venueName?:string;openingHours?:string;source:'CATALOG'|'OSM'|'KAKAO'|'MANUAL';
}
export interface Plan {
 version:1;id:string;title:string;purpose:Purpose;day:string;start:string;end:string;area:string;
 style:string;stops:PlanStop[];updatedAt:string;interests?:TopicSelection;
}
export interface Area {id:string;name:string;point:Point;words:string[]}
// These are neighborhood search centers, never substituted for an event's venue.
export const areas:Area[]=[
 {id:'SEONGSU',name:'성수·서울숲',point:{lat:37.5445,lng:127.0557},words:['성수','서울숲','연무장','왕십리로','뚝섬']},
 {id:'HONGDAE',name:'홍대·연남·합정',point:{lat:37.5568,lng:126.9236},words:['마포','홍대','연남','합정','서교','동교','월드컵북로']},
 {id:'GANGNAM',name:'강남·코엑스',point:{lat:37.5115,lng:127.0593},words:['강남','삼성','코엑스','테헤란']},
 {id:'YEOUIDO',name:'여의도',point:{lat:37.525,lng:126.925},words:['여의도','여의대로','더현대','여의공원']},
 {id:'JONGNO',name:'종로·을지로',point:{lat:37.5703,lng:126.992},words:['종로','을지로','인사동','광화문','중구']},
 {id:'ILSAN',name:'일산·킨텍스',point:{lat:37.6688,lng:126.7457},words:['일산','킨텍스','고양','킨텍스로']},
 {id:'HANAM',name:'하남·스타필드',point:{lat:37.5452,lng:127.2238},words:['하남','미사','스타필드 하남']},
 ...itineraryRegions.map(r=>({id:r.id,name:r.name,point:r.point,words:[r.name]})),
]
export const kindNames:Record<StopKind,string>={EVENT:'행사',FOOD:'식사',CAFE:'카페',PLACE:'장소'}
export const timeMinutes=(time:string)=>/^([01]\d|2[0-3]):[0-5]\d$/.test(time)?Number(time.slice(0,2))*60+Number(time.slice(3)):NaN
export const minuteTime=(n:number)=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`
export function validPoint(p:unknown):p is Point {
 if(!p||typeof p!=='object')return false
 const {lat,lng}=p as Point;return Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=33&&lat<=39&&lng>=124&&lng<=132
}
export function distance(a:Point,b:Point){const rad=(d:number)=>d*Math.PI/180;const dlat=rad(b.lat-a.lat),dlng=rad(b.lng-a.lng);return 6371*2*Math.asin(Math.sqrt(Math.sin(dlat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dlng/2)**2))}
export function operatingOn(row:PublicEventSummary,day:string){
 const choices=row.operatingPlaces?.length?row.operatingPlaces:[{eventId:row.id,event:row.event}]
 return choices.filter(c=>!['CANCELED','POSTPONED','RESCHEDULED'].includes(c.event.operationStatus?.state||'')&&c.event.occurrences.some(o=>includesDay(o,day)))
}
export function recommendedEvents(rows:PublicEventSummary[],day:string,area:string,anchor?:PublicEventSummary,purpose:Purpose='DATE',subjects:string[]=[],selection?:TopicSelection,nearby?:{center:Point;points:Record<number,Point>}) {
 const district=areas.find(a=>a.id===area),anchorCategory=anchor?categoryForType(anchor.event.subcategory).code:''
 return rows.flatMap(row=>operatingOn(row,day).map(place=>({...row,id:place.eventId,event:place.event,operatingPlaces:undefined})))
 .filter(row=>row.id!==anchor?.id&&!!row.event.address&&(nearby?.points[row.id]?distance(nearby.center,nearby.points[row.id])<=3:!district||(regionArea(area)?regionForEvent(row.event)?.id===area:district.words.some(w=>`${row.event.address} ${row.event.venueName||''}`.includes(w)))))
 .filter(row=>purpose!=='EVENT'||!anchorCategory||categoryForType(row.event.subcategory).code===anchorCategory)
 .filter(row=>purpose!=='EVENT'||anchorCategory!=='SUBCULTURE'||matchesTopics(row,selection))
 .map(row=>{
  const topics=anchor?.event.subjects.length?anchor.event.subjects:subjects
  const overlap=row.event.subjects.filter(s=>topics.includes(s)).length
  const km=nearby?.points[row.id]?distance(nearby.center,nearby.points[row.id]):null
  return {row,score:overlap*10+(row.event.subcategory===anchor?.event.subcategory?3:0),distance:km,reason:km!==null?`${overlap?'관심 주제 일치 · ':''}직선거리 ${km<1?`${Math.round(km*1000)}m`:`${km.toFixed(1)}km`}`:overlap?'선택한 관심 주제가 겹쳐요':purpose==='EVENT'?'같은 분야 · 선택한 동네에서 열려요':'선택한 날짜 · 이 동네에서 열려요'}
 }).sort((a,b)=>b.score-a.score||(a.distance??Infinity)-(b.distance??Infinity)||a.row.event.name.localeCompare(b.row.event.name,'ko')).filter((x,i,all)=>all.findIndex(y=>y.row.id===x.row.id)===i)
}
export function eventStop(row:PublicEventSummary,day:string,start:string,point:Point|null=null):PlanStop {
 const occurrence=row.event.occurrences.find(o=>includesDay(o,day))
 const short=['BIRTHDAY_CAFE','POPUP','POPUP_STORE'].includes(row.event.subcategory)||categoryForType(row.event.subcategory).code==='POPUP'
 const officialStart=occurrence?.startTime?.slice(0,5),proposed=Math.max(timeMinutes(start),officialStart?timeMinutes(officialStart):0)
 return {id:crypto.randomUUID(),kind:'EVENT',name:row.event.name,address:row.event.address||'',point,eventId:row.id,
 start:minuteTime(proposed),duration:short?60:180,locked:false,note:'',url:`/discover/${row.id}?day=${day}`,image:row.banner?.url,
 occurrences:row.event.occurrences,venueName:row.event.venueName||undefined,source:'CATALOG'}
}
// Moving stops never changes their explicit times; the conflict list makes the consequence visible.
export function moveStop(stops:PlanStop[],id:string,offset:number){const index=stops.findIndex(s=>s.id===id),next=index+offset;if(index<0||next<0||next>=stops.length)return stops;const copy=[...stops];[copy[index],copy[next]]=[copy[next],copy[index]];return copy}
export interface PlanIssue {stopId:string|null;message:string}
export function planIssueDetails(plan:Plan):PlanIssue[]{
 const result:PlanIssue[]=[]
 const add=(stopId:string|null,message:string)=>result.push({stopId,message})
 if(!validDay(plan.day))add(null,'방문 날짜를 확인해 주세요.')
 const begin=timeMinutes(plan.start),end=timeMinutes(plan.end)
 if(!Number.isFinite(begin)||!Number.isFinite(end)||end<=begin)add(null,'하루 일정의 시작·종료 시간을 확인해 주세요.')
 plan.stops.forEach((s,i)=>{
  const from=timeMinutes(s.start),to=from+s.duration
  if(!Number.isFinite(from)||s.duration<15||s.duration>720)add(s.id,`${i+1}. ${s.name}: 시간·체류 시간을 확인해 주세요.`)
  if(from<begin||to>end)add(s.id,`${i+1}. ${s.name}: 하루 일정 시간 밖에 있어요.`)
  if(i>0){const previous=plan.stops[i-1];if(from<timeMinutes(previous.start)+previous.duration)add(s.id,`${i+1}. ${s.name}: 앞 일정과 시간이 겹쳐요.`)}
  if(s.occurrences){const active=s.occurrences.filter(o=>includesDay(o,plan.day));if(!active.length)add(s.id,`${s.name}: 선택한 날짜에 열리지 않아요.`)
   else if(active.every(o=>(o.startTime&&from<timeMinutes(o.startTime.slice(0,5)))||(o.endTime&&to>timeMinutes(o.endTime.slice(0,5)))))add(s.id,`${s.name}: 공개된 운영 시간 밖에 있어요.`)
  }
 })
 return result
}
export function planIssues(plan:Plan):string[]{return [...new Set(planIssueDetails(plan).map(issue=>issue.message))]}
export function nextStart(plan:Plan,duration:number){const last=plan.stops.at(-1);const from=last?timeMinutes(last.start)+last.duration+30:timeMinutes(plan.start);return from+duration<=timeMinutes(plan.end)?minuteTime(from):null}
export function validatePlan(value:unknown):value is Plan {
 if(!value||typeof value!=='object')return false
 const p=value as Plan
 return p.version===1&&typeof p.id==='string'&&!!p.id&&p.id.length<=128&&typeof p.title==='string'&&p.title.length<=120&&['EVENT','DATE'].includes(p.purpose)&&validDay(p.day)
 &&Number.isFinite(timeMinutes(p.start))&&Number.isFinite(timeMinutes(p.end))&&typeof p.area==='string'&&typeof p.style==='string'&&typeof p.updatedAt==='string'
 &&(p.interests===undefined||p.interests&&['topics','subjects'].every(k=>Array.isArray(p.interests![k as keyof TopicSelection])&&p.interests![k as keyof TopicSelection].length<=10&&p.interests![k as keyof TopicSelection].every(s=>typeof s==='string'&&s.length>0&&s.length<=100)))
 &&Array.isArray(p.stops)&&p.stops.length<=20&&new Set(p.stops.map(s=>s?.id)).size===p.stops.length&&p.stops.every(s=>s&&typeof s.id==='string'&&!!s.id&&s.id.length<=128&&typeof s.name==='string'&&s.name.length<=200
 &&Object.hasOwn(kindNames,s.kind)&&typeof s.address==='string'&&s.address.length<=400&&typeof s.url==='string'&&s.url.length<=2048&&typeof s.note==='string'&&s.note.length<=2000
 &&Number.isFinite(timeMinutes(s.start))&&Number.isInteger(s.duration)&&s.duration>=15&&s.duration<=720&&typeof s.locked==='boolean'
 &&['CATALOG','OSM','KAKAO','MANUAL'].includes(s.source)&&(s.point===null||validPoint(s.point))
 &&(s.eventId===undefined||Number.isSafeInteger(s.eventId)&&s.eventId>0)&&(s.image===undefined||typeof s.image==='string')
 &&(s.occurrences===undefined||Array.isArray(s.occurrences)&&s.occurrences.length<=100&&s.occurrences.every(o=>o&&validDay(o.startDate)&&validDay(o.endDate)&&o.startDate<=o.endDate
 &&[o.startTime,o.endTime].every(t=>t===null||t===undefined||typeof t==='string'&&Number.isFinite(timeMinutes(t.slice(0,5)))))))
}
export function readPlans(storage:Pick<Storage,'getItem'>,key:string):Plan[]{try{const data=JSON.parse(storage.getItem(key)||'[]');return Array.isArray(data)?data.filter(validatePlan).slice(0,20):[]}catch{return []}}
export function savedPlanSignature(rows:Plan[],id:string){const saved=rows.find(p=>p.id===id);return saved?JSON.stringify(saved):''}
export function writePlan(storage:Pick<Storage,'getItem'|'setItem'>,key:string,plan:Plan){if(!validatePlan(plan))throw new Error('일정 내용을 확인해 주세요.');const rows=readPlans(storage,key);storage.setItem(key,JSON.stringify([plan,...rows.filter(p=>p.id!==plan.id)].slice(0,20)))}
const icsEscape=(text:string)=>text.replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;')
export function planCalendar(plan:Plan){
 if(planIssues(plan).length||!plan.stops.length)throw new Error('일정 시간을 먼저 확인해 주세요.')
 const at=(time:string)=>`${plan.day.replaceAll('-','')}T${time.replace(':','')}00`
 const rows=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//BoothHana//Day Plan//KO','CALSCALE:GREGORIAN']
 plan.stops.forEach(s=>rows.push('BEGIN:VEVENT',`UID:${s.id}@boothana.kr`,`DTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'')}`,`DTSTART;TZID=Asia/Seoul:${at(s.start)}`,`DTEND;TZID=Asia/Seoul:${at(minuteTime(timeMinutes(s.start)+s.duration))}`,`SUMMARY:${icsEscape(s.name)}`,`LOCATION:${icsEscape(s.address)}`,'END:VEVENT'))
 rows.push('END:VCALENDAR');return rows.map(line=>{let current='',bytes=0;const chunks:string[]=[];for(const char of line){const n=new TextEncoder().encode(char).length;if(bytes+n>73){chunks.push(current);current=' ';bytes=1}current+=char;bytes+=n}chunks.push(current);return chunks.join('\r\n')}).join('\r\n')+'\r\n'
}
