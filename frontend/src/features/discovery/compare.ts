import type { PublicEventSummary } from '../catalog/api'
export function compareIds(value:string|null):number[]{return [...new Set((value||'').split(',').filter(v=>/^[1-9]\d{0,15}$/.test(v)).map(Number).filter(Number.isSafeInteger))].slice(0,2)}
export function compareHref(ids:number[]){return `/compare${ids.length?'?ids='+ids.join(','):''}`}
export function editionId(row:Pick<PublicEventSummary,'id'|'operatingGroup'>){
 const group=row.operatingGroup
 // A group's root can be withdrawn while other operating days remain public.
 return group?.members.find(m=>m.eventId===group.rootEventId)?.eventId||group?.members[0]?.eventId||row.id
}
export function toggleComparison(ids:number[],id:number){return ids.includes(id)?ids.filter(x=>x!==id):ids.length<2?[...ids,id]:ids}
