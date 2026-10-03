import { useSyncExternalStore } from 'react'
import type { EventData } from '../collection/api'
import { eventBooking } from './booking'
let stamp=Date.now(),timer:ReturnType<typeof setInterval>|undefined
const listeners=new Set<()=>void>()
function subscribe(listener:()=>void){
  listeners.add(listener)
  if(!timer){stamp=Date.now();timer=setInterval(()=>{stamp=Date.now();listeners.forEach(fn=>fn())},30_000)}
  return()=>{listeners.delete(listener);if(!listeners.size){clearInterval(timer);timer=undefined}}
}
export function useBookingNow(){return new Date(useSyncExternalStore(subscribe,()=>stamp,()=>stamp))}
export function BookingBadge({event,day=''}:{event:EventData;day?:string}) {
  const state=eventBooking(event,day,useBookingNow())
  return state?<span className={`booking-badge is-${state.state.toLowerCase()}`}>{state.label}</span>:null
}
