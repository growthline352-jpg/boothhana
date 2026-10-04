import {areas,validPoint,type Plan,type PlanStop,type Point} from './model'
import type {Place} from './places'

export const eventLocationMessage='행사장의 정확한 위치를 확인하지 못했어요. 행사 일정은 만들었으며, 위치 확인 후 주변 음식점·카페를 찾을 수 있어요.'
export function eventArea(address:string|null|undefined,venue?:string|null){
 return areas.find(a=>a.words.some(word=>`${address||''} ${venue||''}`.includes(word)))?.id||''
}
/** An event course must stay centered on its main event, even if another stop is pinned. */
export function planNearbyCenter(plan:Pick<Plan,'purpose'|'stops'>,areaCenter:Point):Point|null{
 if(plan.purpose==='DATE')return plan.stops.find(s=>s.locked&&s.point)?.point||plan.stops.find(s=>s.kind==='EVENT'&&s.point)?.point||areaCenter
 const main=plan.stops.find(s=>s.kind==='EVENT'&&s.locked)||plan.stops.find(s=>s.kind==='EVENT')
 return validPoint(main?.point)?main.point:null
}
export async function resolveEventLocation(address:string|null|undefined,publishedPoint:Point|null,resolve:(address:string)=>Promise<Point|null>):Promise<Point|null>{
 if(validPoint(publishedPoint))return publishedPoint
 if(!address?.trim())return null
 try{const point=await resolve(address);return validPoint(point)?point:null}catch{return null}
}
/** Keep the provider link only while the selected public place remains unchanged. */
export function manualPlaceStop(stop:PlanStop,selected:Place|null):PlanStop{
 const unchanged=selected&&stop.name===selected.name&&stop.address===selected.address&&stop.point?.lat===selected.point.lat&&stop.point?.lng===selected.point.lng
 return {...stop,source:unchanged?selected.provider||'OSM':'MANUAL',url:unchanged?selected.url:''}
}
