import {validatePlan,timeMinutes,minuteTime,type Plan} from './model'

export interface WizardDraft {version:1;plan:Plan;step:number;anchorId:number|null;anchorTime:string;duration:number;field:string;query:string;updatedAt:string}
export function readWizardDraft(storage:Pick<Storage,'getItem'>,key:string):WizardDraft|null{
 try{const value=JSON.parse(storage.getItem(key)||'null') as WizardDraft|null
  return value&&value.version===1&&validatePlan(value.plan)&&Number.isInteger(value.step)&&value.step>=1&&value.step<=5&&(value.anchorId===null||Number.isSafeInteger(value.anchorId)&&value.anchorId>0)&&Number.isFinite(timeMinutes(value.anchorTime))&&Number.isInteger(value.duration)&&value.duration>=15&&value.duration<=480&&['ALL','SUBCULTURE','EXHIBITION','FESTIVAL','POPUP'].includes(value.field)&&typeof value.query==='string'&&value.query.length<=200&&typeof value.updatedAt==='string'?value:null
 }catch{return null}
}
/** Fixed bookings retain their times. Unlocked stops use venue opening times and a visible buffer. */
export function fitTimes(plan:Plan,gap=30):Plan{
 let cursor=timeMinutes(plan.start)
 const stops=plan.stops.map((stop,index)=>{
  if(stop.locked){cursor=timeMinutes(stop.start)+stop.duration+gap;return stop}
  const active=stop.occurrences?.filter(o=>o.startDate<=plan.day&&o.endDate>=plan.day)||[]
  const windows=active.length?active:[{startTime:null,endTime:null}]
  const nextFixed=plan.stops.slice(index+1).find(s=>s.locked)
  const limit=Math.min(timeMinutes(plan.end),nextFixed?timeMinutes(nextFixed.start)-gap:Infinity)
  const start=windows.map(o=>({from:Math.max(cursor,o.startTime?timeMinutes(o.startTime.slice(0,5)):0),end:Math.min(limit,o.endTime?timeMinutes(o.endTime.slice(0,5)):Infinity)})).filter(w=>w.from+stop.duration<=w.end).sort((a,b)=>a.from-b.from)[0]?.from
  if(start===undefined){cursor=Math.max(cursor,timeMinutes(stop.start)+stop.duration+gap);return stop}
  cursor=start+stop.duration+gap;return {...stop,start:minuteTime(start)}
 })
 return {...plan,stops}
}
