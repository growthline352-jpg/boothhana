import {api,publicRead} from '../../api/client'
import {validatePlan,type Plan} from './model'
import type {StoredPlan} from './personalApi'

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
type CopyStorage=Pick<Storage,'getItem'|'setItem'|'removeItem'>
interface CopyAttempt {source:string;plan:Plan;requestId?:string;confirmed?:boolean}
export function sharedCopyStorageKey(owner:string,token:string){return `boothhana.itinerary-copy.v1:${owner}:${token}`}
function readCopyAttempt(storage:CopyStorage,key:string):CopyAttempt|null{
 const attempt=JSON.parse(storage.getItem(key)||'null');if(attempt===null)return null;
 if(typeof attempt.source!=='string'||!validatePlan(attempt.plan)||(attempt.requestId!==undefined&&(typeof attempt.requestId!=='string'||!/^[\da-f-]{36}$/i.test(attempt.requestId)))||(attempt.confirmed!==undefined&&typeof attempt.confirmed!=='boolean'))throw new Error('Invalid copy request');return attempt;
}
/** Keep the whole request before sending so uncertain outcomes can retry identically. */
export async function saveSharedCopy(storage:CopyStorage,owner:string,token:string,source:Plan,save:(plan:Plan,revision:number,owner:number)=>Promise<StoredPlan>,isCurrent=()=>true,newCopy=false,tabStorage?:CopyStorage):Promise<Plan>{
 const userId=Number(owner.slice(7)),key=sharedCopyStorageKey(owner,token),signature=JSON.stringify(publicSnapshot(source,true));
 const current=()=>{if(!isCurrent())throw new Error('계정이나 공유 일정이 바뀌었어요. 현재 화면에서 다시 열어 주세요.')};current();
 if(!/^member:[1-9]\d*$/.test(owner)||!Number.isSafeInteger(userId))throw new Error('계정에 로그인해 주세요.')
 let shared:CopyAttempt|null,tab:CopyAttempt|null;
 try{shared=readCopyAttempt(storage,key);tab=tabStorage?readCopyAttempt(tabStorage,key):null}
 catch{throw new Error('이 기기의 복사 재시도 정보를 확인하지 못했어요. 브라우저 저장 공간을 확인해 주세요. 아직 계정에 전송하지 않았어요.')}
 const resumingOwn=!newCopy&&tab?.source===signature&&!tab.confirmed,confirmedHere=tab?.source===signature&&tab.confirmed;
 const next=resumingOwn?tab!.plan:!newCopy&&!confirmedHere&&shared?.source===signature?shared.plan:copySharedPlan(source),attempt:CopyAttempt={source:signature,plan:next,requestId:crypto.randomUUID()};
 try{if(tabStorage)tabStorage.setItem(key,JSON.stringify(attempt));if(!resumingOwn||!shared||shared.plan.id===next.id)storage.setItem(key,JSON.stringify(attempt))}
 catch{throw new Error('복사 재시도 정보를 이 기기에 보관하지 못했어요. 브라우저 저장 공간을 확인해 주세요. 아직 계정에 전송하지 않았어요.')}
 let stored:StoredPlan;
 try{current();stored=await save(next,0,userId);current();if(!validatePlan(stored?.plan)||stored.plan.id!==next.id||!Number.isSafeInteger(stored.revision)||stored.revision<1)throw new Error('복사 저장 결과를 확인하지 못했어요. 같은 요청으로 다시 시도해 주세요.')}
 catch(error){
  // Preserve this caller's uncertain outcome without replacing another intentional copy.
  if(isCurrent())try{const latest=readCopyAttempt(storage,key);if(!latest||latest.plan.id===next.id)storage.setItem(key,JSON.stringify(attempt))}catch{/* The tab's pending body remains available for retry. */}
  throw error;
 }
 // A confirmed tab starts a fresh copy on its next click, even if another tab still retries.
 try{tabStorage?.setItem(key,JSON.stringify({source:signature,plan:next,confirmed:true}))}catch{/* Retain the same request when confirmation cannot be recorded. */}
 try{const latest=readCopyAttempt(storage,key);if(latest?.requestId===attempt.requestId)storage.removeItem(key)}catch{/* A retained retry request still points to the confirmed same copy. */}
 return stored.plan;
}
