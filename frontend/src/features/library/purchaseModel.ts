import type {MemoryEntry} from './types'
export interface PurchaseItem {id:string;boothKey:string;boothName:string;memoryId:string|null;name:string;quantity:number;unitBudget:number|null;purchased:boolean;prepaid:boolean;received:boolean;note:string}
export interface PurchaseBooth {key:string;name:string;memoryId:string|null}
export interface PurchasePlan {eventId:number;eventName:string;budget:number|null;items:PurchaseItem[];booths?:PurchaseBooth[];excludedMemoryIds?:string[]}
export interface StoredPurchase {plan:PurchasePlan;revision:number;updatedAt:string}
export const MAX_PURCHASE_BOOTHS=500
export function libraryBoothsHref(eventId:number,focus=''){const q=new URLSearchParams({event:String(eventId),view:'booths'});if(focus)q.set('focus',focus);return `/library?${q}`}
export function purchaseSummary(plan:PurchasePlan){return {total:plan.items.reduce((sum,i)=>sum+(i.unitBudget??0)*i.quantity,0),unknown:plan.items.filter(i=>i.unitBudget===null).length,purchased:plan.items.filter(i=>i.purchased).length,pickups:plan.items.filter(i=>i.prepaid&&!i.received).length}}
export function purchaseGroups(items:PurchaseItem[]){const keys=[...new Set(items.map(i=>i.boothKey))];return keys.map(key=>({key,name:items.find(i=>i.boothKey===key)!.boothName,items:items.filter(i=>i.boothKey===key)}))}
export function movePurchaseGroup(items:PurchaseItem[],key:string,delta:number){const groups=purchaseGroups(items),from=groups.findIndex(g=>g.key===key),to=from+delta;if(from<0||to<0||to>=groups.length)return items;[groups[from],groups[to]]=[groups[to],groups[from]];return groups.flatMap(g=>g.items)}
export function purchaseFromMemory(entry:MemoryEntry):PurchaseItem {
 const m=entry.current?.memory,boothName=(entry.target.type==='PARTICIPANT'?m?.title:m?.participantName)||'부스 이름 입력',amount=entry.current?.price?.currency==='KRW'?Number(entry.current.price.amount):NaN
 return {id:crypto.randomUUID(),boothKey:`saved:${entry.target.participantId||entry.target.id}`,boothName:boothName.slice(0,200),memoryId:entry.id,name:entry.target.type==='PRODUCT'?(m?.title||'구매할 물건').slice(0,200):'구매할 물건',quantity:1,unitBudget:Number.isInteger(amount)&&amount>=0&&amount<=100000000?amount:null,purchased:false,prepaid:false,received:false,note:''}
}
/** Saved booths need no placeholder item. Existing personal fields and order always win. */
export function mergeSavedPurchases(base:PurchasePlan,memories:MemoryEntry[]):PurchasePlan {
 const live=memories.filter(m=>m.target.eventId===base.eventId&&m.available&&m.target.type!=='EVENT');
 const placeholder=(i:PurchaseItem)=>memories.some(m=>m.id===i.memoryId&&m.target.type==='PARTICIPANT')&&i.name==='구매할 물건'&&i.quantity===1&&i.unitBudget===null&&!i.purchased&&!i.prepaid&&!i.received&&!i.note;
 const items=base.items.filter(i=>!placeholder(i));
 const booths:PurchaseBooth[]=(base.booths||purchaseGroups(base.items).map(g=>({key:g.key,name:g.name,memoryId:memories.find(m=>m.target.type==='PARTICIPANT'&&`saved:${m.target.id}`===g.key)?.id||null}))).map(b=>({...b}));
 for(const m of live){const key=`saved:${m.target.participantId||m.target.id}`,existing=booths.find(b=>b.key===key);if(existing){if(m.target.type==='PARTICIPANT'&&!existing.memoryId)existing.memoryId=m.id}else{if(booths.length>=MAX_PURCHASE_BOOTHS)continue;booths.push({key,name:((m.target.type==='PARTICIPANT'?m.current?.memory.title:m.current?.memory.participantName)||'부스 이름 미확인').slice(0,200),memoryId:m.target.type==='PARTICIPANT'?m.id:null})}
  if(m.target.type==='PRODUCT'&&items.length<100&&!items.some(i=>i.memoryId===m.id)&&!base.excludedMemoryIds?.includes(m.id))items.push({...purchaseFromMemory(m),id:m.id});
 }
 return {...base,items,booths,excludedMemoryIds:base.excludedMemoryIds||[]};
}
export function orderedPurchaseBooths(plan:PurchasePlan){return (plan.booths||purchaseGroups(plan.items).map(g=>({key:g.key,name:g.name,memoryId:null}))).map(b=>({...b,items:plan.items.filter(i=>i.boothKey===b.key)}))}
export function unlinkedPurchaseBooths(plan:PurchasePlan,memories:MemoryEntry[]){const keys=new Set(orderedPurchaseBooths(plan).map(b=>b.key));return new Set(memories.filter(m=>m.available&&m.target.eventId===plan.eventId&&m.target.type!=='EVENT').map(m=>`saved:${m.target.participantId||m.target.id}`).filter(key=>!keys.has(key))).size}
export function moveBooth(plan:PurchasePlan,key:string,delta:number):PurchasePlan {const booths=[...orderedPurchaseBooths(plan)].map(({key,name,memoryId})=>({key,name,memoryId})),from=booths.findIndex(b=>b.key===key),to=from+delta;if(from<0||to<0||to>=booths.length)return plan;[booths[from],booths[to]]=[booths[to],booths[from]];return {...plan,booths}}
export function removePurchaseItem(plan:PurchasePlan,id:string){const item=plan.items.find(i=>i.id===id);return {...plan,items:plan.items.filter(i=>i.id!==id),excludedMemoryIds:item?.memoryId?[...new Set([...(plan.excludedMemoryIds||[]),item.memoryId])]:plan.excludedMemoryIds||[]}}
export function validPurchasePlan(value:unknown):value is PurchasePlan {return checkedPurchase(value,false)}
/** Editable fields may be incomplete; ownership, references and structure remain bounded. */
export function validPurchaseDraft(value:unknown):value is PurchasePlan {return checkedPurchase(value,true)}
function checkedPurchase(value:unknown,draft:boolean):value is PurchasePlan {
 if(!value||typeof value!=='object')return false;const p=value as PurchasePlan,money=(v:unknown)=>v===null||typeof v==='number'&&Number.isFinite(v)&&(draft?Math.abs(v)<=1e12:Number.isInteger(v)&&v>=0&&v<=100000000),text=(v:unknown,max:number,required=true)=>typeof v==='string'&&v.length<=max&&!v.includes('\0')&&(!required||!!v.trim())
 const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
 return Number.isSafeInteger(p.eventId)&&p.eventId>0&&text(p.eventName,255)&&money(p.budget)&&Array.isArray(p.items)&&p.items.length<=100&&new Set(p.items.map(i=>i?.id)).size===p.items.length&&p.items.every(i=>i&&uuid(i.id)&&text(i.boothKey,128)&&text(i.boothName,200,!draft)&&text(i.name,200,!draft)&&text(i.note,1000,false)&&(i.memoryId===null||uuid(i.memoryId))&&(draft?Number.isFinite(i.quantity)&&Math.abs(i.quantity)<=1e6:Number.isInteger(i.quantity)&&i.quantity>=1&&i.quantity<=999)&&money(i.unitBudget)&&typeof i.purchased==='boolean'&&typeof i.prepaid==='boolean'&&typeof i.received==='boolean'&&(!i.received||i.prepaid))
  &&(p.booths===undefined||Array.isArray(p.booths)&&p.booths.length<=MAX_PURCHASE_BOOTHS&&new Set(p.booths.map(b=>b?.key)).size===p.booths.length&&p.booths.every(b=>b&&text(b.key,128)&&text(b.name,200,!draft)&&(b.memoryId===null||uuid(b.memoryId)))&&p.items.every(i=>p.booths!.some(b=>b.key===i.boothKey)))
  &&(p.excludedMemoryIds===undefined||Array.isArray(p.excludedMemoryIds)&&p.excludedMemoryIds.length<=500&&new Set(p.excludedMemoryIds).size===p.excludedMemoryIds.length&&p.excludedMemoryIds.every(uuid))
}
