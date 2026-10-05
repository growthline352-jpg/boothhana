import {api,publicRead} from '../../api/client'
import {validatePlan,type Plan} from './model'

export interface ShareResult {token:string;createdAt:string;expiresAt:string}
export interface ShareInput {requestId:string;managementKey:string;plan:Plan;includeNotes:boolean}
export interface ManagedShare {input:ShareInput;result?:ShareResult}
const route='/api/public/itinerary/shares'
export const shareApi={
 create:(input:ShareInput)=>api<ShareResult>(route,{method:'POST',body:JSON.stringify(input)}),
 read:(token:string)=>publicRead<{plan:Plan;createdAt:string;expiresAt:string}>(`${route}/${encodeURIComponent(token)}`),
 revoke:(share:ManagedShare)=>api<void>(`${route}/${share.input.requestId}/revoke`,{method:'POST',body:JSON.stringify({managementKey:share.input.managementKey})}),
}
export function shareStorageKey(owner:string){return `boothhana.itinerary-shares.v1:${owner}`}
export function safeShareUrl(value:string){
 if(/^\/discover\/[1-9]\d*(?:\?day=\d{4}-\d{2}-\d{2})?$/.test(value))return value
 try{const u=new URL(value);if(u.protocol==='https:'&&!u.username&&!u.password&&!value.includes('\\'))return u.href}catch{/* omit malformed user links */}
 return ''
}
export function publicSnapshot(plan:Plan,includeNotes=false):Plan{
 // Explicit allowlist also keeps accidentally added account fields off the wire.
 return {version:1,id:plan.id,title:plan.title.trim()||'나의 하루 일정',purpose:plan.purpose,day:plan.day,start:plan.start,end:plan.end,area:plan.area,style:plan.style,updatedAt:plan.updatedAt,
  ...(plan.interests?{interests:{topics:[...plan.interests.topics],subjects:[...plan.interests.subjects]}}:{}),
  stops:plan.stops.map(s=>({id:s.id,kind:s.kind,name:s.name,address:s.address,point:s.point?{lat:s.point.lat,lng:s.point.lng}:null,eventId:s.eventId,start:s.start,duration:s.duration,locked:s.locked,note:includeNotes?s.note:'',url:safeShareUrl(s.url),image:s.image?safeShareUrl(s.image):undefined,occurrences:s.occurrences?.map(o=>({startDate:o.startDate,endDate:o.endDate,startTime:o.startTime,endTime:o.endTime})),venueName:s.venueName,openingHours:s.openingHours,source:s.source}))}
}
export function createShareInput(plan:Plan,includeNotes:boolean):ShareInput{
 const bytes=crypto.getRandomValues(new Uint8Array(32)),key=btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')
 return {requestId:crypto.randomUUID(),managementKey:key,plan:publicSnapshot(plan,includeNotes),includeNotes}
}
export function readManagedShares(storage:Pick<Storage,'getItem'>,key:string):ManagedShare[]{
 try{const rows:unknown=JSON.parse(storage.getItem(key)||'[]');if(!Array.isArray(rows))return []
  return rows.filter((s:ManagedShare)=>s?.input&&/^[\da-f-]{36}$/i.test(s.input.requestId)&&/^[\w-]{43}$/.test(s.input.managementKey)&&typeof s.input.includeNotes==='boolean'&&validatePlan(s.input.plan)&&(!s.result||/^[\w-]{22}$/.test(s.result.token)&&Number.isFinite(Date.parse(s.result.expiresAt))&&Date.parse(s.result.expiresAt)>Date.now())).slice(0,100)
 }catch{return []}
}
export function writeManagedShares(storage:Pick<Storage,'setItem'>,key:string,rows:ManagedShare[]){storage.setItem(key,JSON.stringify(rows))}
export function shareLink(token:string,origin=window.location.origin){return `${origin}/itinerary/shared/${encodeURIComponent(token)}`}
export function shareSignature(plan:Plan,includeNotes:boolean){return JSON.stringify({...publicSnapshot(plan,includeNotes),updatedAt:''})}
export function copySharedPlan(plan:Plan):Plan{const snapshot=publicSnapshot(plan,true);return {...snapshot,id:crypto.randomUUID(),title:snapshot.title.slice(0,114)+' (복사본)',stops:snapshot.stops.map(s=>({...s,id:crypto.randomUUID()})),updatedAt:new Date().toISOString()}}
