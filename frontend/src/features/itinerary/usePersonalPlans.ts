import {useEffect,useState,useSyncExternalStore} from 'react'
import {PersonalPlanStore} from './PersonalPlanStore'
import {personalApi} from './personalApi'
export function usePersonalPlans(owner:string){
 const [store]=useState(()=>new PersonalPlanStore(personalApi,localStorage))
 const state=useSyncExternalStore(store.subscribe,store.read)
 useEffect(()=>{store.bind(owner);return()=>store.bind('')},[owner,store])
 return {store,state,ready:state.owner===owner&&state.status==='ready'}
}
