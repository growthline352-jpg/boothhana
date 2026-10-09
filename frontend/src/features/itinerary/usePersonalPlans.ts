import {useEffect,useMemo,useSyncExternalStore} from 'react'
import {PersonalPlanStore} from './PersonalPlanStore'
import {personalApi} from './personalApi'
import {remoteCache} from '../../app/RemoteCache'
const stores=new Map<string,PersonalPlanStore>()
remoteCache.subscribe(()=>{for(const store of stores.values())store.bind('');stores.clear()})
export function usePersonalPlans(owner:string){
 const epoch=useSyncExternalStore(remoteCache.subscribe,remoteCache.readEpoch)
 // A confirmed account change clears stores, including one cached for this same owner.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 const store=useMemo(()=>{let entry=stores.get(owner);if(!entry){entry=new PersonalPlanStore(personalApi,localStorage);stores.set(owner,entry)}return entry},[owner,epoch])
 const state=useSyncExternalStore(store.subscribe,store.read)
 useEffect(()=>{store.bind(owner)},[owner,store])
 return {store,state,ready:state.owner===owner&&state.status==='ready'}
}
