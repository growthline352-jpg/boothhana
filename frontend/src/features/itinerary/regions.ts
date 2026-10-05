import type {PublicEventSummary} from '../catalog/api'
import {operatingOn} from './model'
import {itineraryRegions,regionForEvent} from './regionCatalog'

export function operatingEvents(rows:PublicEventSummary[],day:string){
 const seen=new Set<number>()
 return rows.flatMap(row=>operatingOn(row,day).map(place=>({...row,id:place.eventId,event:place.event,operatingPlaces:undefined})))
 .filter(row=>{if(seen.has(row.id))return false;seen.add(row.id);return true})
}
export function regionEvents(rows:PublicEventSummary[],day:string,area:string){
 return operatingEvents(rows,day).filter(row=>area==='UNLOCATED'?!regionForEvent(row.event):regionForEvent(row.event)?.id===area)
}
export function regionCounts(rows:PublicEventSummary[],day:string){
 const counts=Object.fromEntries(itineraryRegions.map(r=>[r.id,0]))
 let unlocated=0
 for(const row of operatingEvents(rows,day)){const region=regionForEvent(row.event);if(region)counts[region.id]++;else unlocated++}
 return {counts,unlocated}
}
