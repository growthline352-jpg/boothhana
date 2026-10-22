import {useEffect,useMemo,useSyncExternalStore} from 'react'
import {useAuth} from '../../app/useAuth'
import {usePersonalPlans} from '../itinerary/usePersonalPlans'
import {personalApi} from '../itinerary/personalApi'
import {OutingsAccountStore} from './OutingsAccountStore'

export function useOutings(){
 const auth=useAuth(),owner=auth.status==='authenticated'&&auth.user?`member:${auth.user.id}`:auth.status==='anonymous'?'guest':''
 const personal=usePersonalPlans(owner)
 const store=useMemo(()=>new OutingsAccountStore(personalApi,localStorage,personal.store),[personal.store])
 const snapshot=useSyncExternalStore(store.subscribe,store.read)
 useEffect(()=>{store.bind(owner);return()=>store.bind('')},[store,owner])
 const visible=snapshot.owner===owner?snapshot:{...snapshot,owner,state:{version:1 as const,plans:[],saved:[],activeId:''},ready:false,imports:[],savedIds:[],dirtyIds:[],error:''}
 return {...visible,auth,store,write:store.write,undo:store.undo,canUndo:store.canUndo}
}
