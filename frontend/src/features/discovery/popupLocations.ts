import {resolveAddress} from '../itinerary/places'
import type {Point} from '../itinerary/model'

export interface PopupPlace {event_id:number;display_event_id?:number;neighborhood:string;address:string;latitude:number|null;longitude:number|null}
export interface PopupPin extends PopupPlace {latitude:number;longitude:number}
export function popupPoint(point:Point|null):point is Point {
 return !!point&&Number.isFinite(point.lat)&&Number.isFinite(point.lng)&&point.lat>=37.4&&point.lat<=37.75&&point.lng>=126.7&&point.lng<=127.25
}
export function popupAddressQuery(address:string):string {
 const value=address.trim().replace(/\s*(?:지하\s*)?\d+(?:\s*[~-]\s*\d+)?층.*$/,'').trim()
 // Never turn a district-only address into a marker at the district's center.
 return /^서울(?:특별시)?\s+\S+구\s+.*(?:로|길|동|가)\s+\d/.test(value)?value:''
}
export function storedPopupPins(places:PopupPlace[]):PopupPin[] {
 return places.filter((p):p is PopupPin=>popupPoint(p.latitude===null||p.longitude===null?null:{lat:p.latitude,lng:p.longitude}))
}
/** Resolve only on map demand, sharing identical addresses and limiting provider concurrency. */
export async function resolvePopupLocations(places:PopupPlace[],progress:(pins:PopupPin[])=>void,isCurrent=()=>true,resolve=resolveAddress):Promise<PopupPin[]> {
 const pins=storedPopupPins(places),known=new Set(pins.map(p=>p.event_id)),jobs=new Map<string,PopupPlace[]>()
 for(const place of places){
  if(known.has(place.event_id))continue
  const address=popupAddressQuery(place.address);if(!address)continue
  jobs.set(address,[...(jobs.get(address)||[]),place])
 }
 const queue=[...jobs],points=new Map<string,Point>()
 for(const pin of pins){const address=popupAddressQuery(pin.address);if(address)points.set(address,{lat:pin.latitude,lng:pin.longitude})}
 let cursor=0
 await Promise.all(Array.from({length:Math.min(4,queue.length)},async()=>{
  while(isCurrent()&&cursor<queue.length){
   const [address,group]=queue[cursor++]
   let point=points.get(address)||null
   if(!point)try{point=await resolve(address)}catch{point=null}
   if(!isCurrent())return
   if(popupPoint(point)){pins.push(...group.map(p=>({...p,latitude:point!.lat,longitude:point!.lng})));progress([...pins])}
  }
 }))
 return pins
}
