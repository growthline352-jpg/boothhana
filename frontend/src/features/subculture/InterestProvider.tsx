import { createContext,useContext,useRef,useState,type ReactNode } from 'react'
import { useAuth } from '../../app/useAuth'
import { useRemote } from '../../app/useRemote'
import { subcultureApi,type Interest,type Settings } from './api'
type Value={settings:Settings|null;loading:boolean;error:Error|null;busy:boolean;reload:()=>Promise<void>;save:(entries:Interest[],revision:number)=>Promise<Settings>}
const Context=createContext<Value|null>(null)
export function InterestProvider({children}:{children:ReactNode}){
 const auth=useAuth(),[busy,setBusy]=useState(false),guard=useRef(false)
 const owner=auth.status==='authenticated'?auth.user?.id:null
 const state=useRemote("features/subculture/InterestProvider:InterestProvider:state", ()=>owner?subcultureApi.settings():Promise.resolve<Settings>({revision:0,entries:[]}),[owner,auth.generation,auth.status])
 async function save(entries:Interest[],revision:number){if(!owner||auth.status!=='authenticated')throw new Error('로그인 후 관심을 저장해 주세요.');if(guard.current)throw new Error('이전 변경을 저장하고 있어요.');guard.current=true;setBusy(true);const before=auth.getSnapshot();try{const result=await subcultureApi.save({revision,entries});const now=auth.getSnapshot();if(now.generation!==before.generation||now.user?.id!==owner)throw new Error('계정이 변경됐어요. 현재 계정에서 다시 확인해 주세요.');state.setData(result);return result;}finally{guard.current=false;setBusy(false)}}
 return <Context.Provider value={{settings:state.data,loading:auth.loading||state.loading,error:auth.status==='error'?new Error('로그인 상태를 다시 확인해 주세요.'):state.error,busy,reload:state.reload,save}}>{children}</Context.Provider>
}
export function useInterests(){const value=useContext(Context);if(!value)throw new Error('InterestProvider required');return value}
