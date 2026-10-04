import type {PublicEventSummary} from '../catalog/api'
import {categoryForType} from '../discovery/categories'
import {taxonomyFields} from '../interests/taxonomy'
import {defaultDay} from '../visit/visit'

export interface TopicSelection {topics:string[];subjects:string[]}
export const subcultureTopics=taxonomyFields.find(f=>f.code==='SUBCULTURE')!.topics
export const emptyTopics=():TopicSelection=>({topics:[],subjects:[]})
const normalized=(s:string)=>s.normalize('NFKC').toLocaleLowerCase().replace(/[\s:·_-]+/g,'')
const tags=(row:PublicEventSummary)=>row.event.subjects.map(normalized)
/** Broad topics are explicit taxonomy matches. Never infer them from a description. */
export function matchesTopics(row:PublicEventSummary,selection?:TopicSelection){
 if(!selection||(!selection.topics.length&&!selection.subjects.length))return true
 if(categoryForType(row.event.subcategory).code!=='SUBCULTURE')return false
 const values=tags(row)
 const broad=!selection.topics.length||subcultureTopics.some(t=>selection.topics.includes(t.code)&&
  (t.types.includes(row.event.subcategory)||[t.code,t.label,...t.subjects,...t.works].some(s=>values.includes(normalized(s)))))
 const specific=!selection.subjects.length||selection.subjects.some(s=>values.includes(normalized(s)))
 return broad&&specific
}
/** Every suggested tag is present on a public event; no invented work or character list. */
export function subjectOptions(rows:PublicEventSummary[],selection:TopicSelection){
 const generic=new Set(taxonomyFields.flatMap(f=>[...f.formats,...f.topics].flatMap(t=>[t.code,t.label,...t.subjects.filter(s=>!t.works.includes(s))])).map(normalized))
 for(const word of ['서브컬처','굿즈','공식 굿즈','팬행사','동인','전시','음악','서브컬처 음악','창작굿즈','코스프레','애니송'])generic.add(normalized(word))
 const options=new Map<string,{value:string;count:number}>()
 const seen=new Set<number>()
 const places=rows.flatMap(row=>(row.operatingPlaces?.length?row.operatingPlaces:[{eventId:row.id,event:row.event}]).map(p=>({...row,id:p.eventId,event:p.event,operatingPlaces:undefined})))
 for(const row of places){if(seen.has(row.id)||['CANCELED','POSTPONED','RESCHEDULED'].includes(row.event.operationStatus?.state||'')||categoryForType(row.event.subcategory).code!=='SUBCULTURE'||!matchesTopics(row,{topics:selection.topics,subjects:[]}))continue;seen.add(row.id)
  for(const value of new Set(row.event.subjects.map(s=>s.trim()).filter(Boolean))){const key=normalized(value);if(generic.has(key)||/^[A-Z][A-Z0-9_]*$/.test(value))continue;const old=options.get(key);options.set(key,{value:old?.value||value,count:(old?.count||0)+1})}
 }
 return [...options.values()].sort((a,b)=>b.count-a.count||a.value.localeCompare(b.value,'ko'))
}
export function upcomingMatches(rows:PublicEventSummary[],selection:TopicSelection,after:string){
 return rows.flatMap(row=>(row.operatingPlaces?.length?row.operatingPlaces:[{eventId:row.id,event:row.event}]).map(p=>({...row,id:p.eventId,event:p.event,operatingPlaces:undefined})))
  .filter(row=>categoryForType(row.event.subcategory).code==='SUBCULTURE'&&matchesTopics(row,selection)&&!['CANCELED','POSTPONED','RESCHEDULED'].includes(row.event.operationStatus?.state||''))
  .map(row=>({row,day:defaultDay(row.event,after,after)})).filter(x=>x.day&&x.day>after)
  .sort((a,b)=>a.day.localeCompare(b.day)||a.row.event.name.localeCompare(b.row.event.name,'ko'))
  .filter((x,i,all)=>all.findIndex(y=>y.row.id===x.row.id)===i)
}
