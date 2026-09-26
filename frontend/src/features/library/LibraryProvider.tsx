import { createContext,useCallback,useContext,useEffect,useLayoutEffect,useMemo,useRef,useState,type ReactNode } from 'react'
import { AuthContext } from '../../app/auth-context'
import type { AuthSnapshot } from '../../app/AuthSession'
import { PublicMemoryCache } from './publicCache'
import { libraryApi } from './api'
import { GuestStore,isGuestStorageKey } from './guestStore'
import { guestEntry,targetKey,validInput } from './memory'
import { seoulToday } from '../discovery/browse'
import type { GuestMemory,MemoryEntry,MemoryIndex,MemoryTarget,ResolvedMemory,SaveInput } from './types'

interface LibraryValue {
 owner:string;loading:boolean;error:string;version:number;index:MemoryIndex[];guest:GuestMemory[];
 publicVersion:number;refreshPublic:()=>void;resolvePublic:(targets:MemoryTarget[])=>Promise<ResolvedMemory[]>;
 refresh:()=>Promise<void>;save:(i:SaveInput)=>Promise<MemoryIndex>;remove:(row:MemoryIndex)=>Promise<void>;
 edit:(row:MemoryEntry,note:string,day:string,hall:string)=>Promise<void>;
 visit:(row:MemoryEntry,day:string,visited:boolean)=>Promise<void>;
 importGuest:()=>Promise<{imported:number;remaining:number;issues:string[]}>;
 clearGuest:()=>void;discardGuest:(key:string)=>void
}
const LibraryContext=createContext<LibraryValue|null>(null)
export function useLibrary(){return useContext(LibraryContext)}
export function storageOwner(auth:Pick<AuthSnapshot,'status'|'user'>|null|undefined):string {
 if(auth?.status==='authenticated'&&auth.user)return `member:${auth.user.id}`
 if(auth?.status==='anonymous')return 'guest'
 return auth?.status==='error'?'error':'loading'
}
const usable=(owner:string)=>owner==='guest'||owner.startsWith('member:')
const storage=()=>{try{return window.localStorage}catch{throw Error('브라우저가 기기 저장을 막고 있어요. 로그인 후 계정 보관함을 이용해 주세요.')}}
const guestIndex=(rows:GuestMemory[]):MemoryIndex[]=>rows.map(x=>({id:x.key,target:x.target,revision:x.revision||0,day:x.day,hall:x.hall,visitedDays:x.visitedDays}))
export function LibraryProvider({children}:{children:ReactNode}) {
 const auth=useContext(AuthContext)
 const owner=storageOwner(auth)
 const publicCache=useMemo(()=>new PublicMemoryCache(),[]),[publicVersion,setPublicVersion]=useState(0)
 const refreshPublic=useCallback(()=>{publicCache.clear();setPublicVersion(n=>n+1)},[publicCache])
 const resolvePublic=publicCache.resolve
 const store=useMemo(()=>new GuestStore(storage),[]),epoch=useRef(0),ownerRef=useRef(owner),serial=useRef(0)
 const [state,setState]=useState<{owner:string;index:MemoryIndex[];loading:boolean;error:string}>({owner:'loading',index:[],loading:true,error:''})
 const [guest,setGuest]=useState<GuestMemory[]>([]),[version,setVersion]=useState(0)
 const readGuest=useCallback(()=>{try{const rows=store.list();setGuest(rows);return rows}catch{return []}},[store])
 useLayoutEffect(()=>{ownerRef.current=owner;epoch.current++;serial.current++;publicCache.clear();setState({owner,index:[],loading:owner==='loading'||owner.startsWith('member:'),error:owner==='error'?(auth?.error||'계정을 다시 확인해 주세요.') : ''});if(usable(owner))readGuest()},[owner,readGuest,publicCache,auth?.generation])
 const refresh=useCallback(async()=>{const session=epoch.current,who=ownerRef.current,request=++serial.current
  if(!usable(who))return
  const drafts=readGuest()
  if(who==='guest'){setState({owner:who,index:guestIndex(drafts),loading:false,error:''});return}
  try{const rows=await libraryApi.index();if(epoch.current===session&&request===serial.current&&storageOwner(auth?.getSnapshot())===who)setState({owner:who,index:rows,loading:false,error:''})}
  catch(e){if(epoch.current===session&&request===serial.current&&storageOwner(auth?.getSnapshot())===who)setState({owner:who,index:[],loading:false,error:e instanceof Error?e.message:'보관함을 확인하지 못했어요.'})}
 },[readGuest,auth?.getSnapshot])
 useEffect(()=>{void refresh()},[owner,refresh,auth?.generation])
 useEffect(()=>{const focus=()=>{refreshPublic();void auth?.refresh()};const visible=()=>{if(document.visibilityState==='visible')focus()};window.addEventListener('focus',focus);window.addEventListener('pageshow',focus);document.addEventListener('visibilitychange',visible);return()=>{window.removeEventListener('focus',focus);window.removeEventListener('pageshow',focus);document.removeEventListener('visibilitychange',visible)}},[auth?.refresh,refreshPublic])
 useEffect(()=>{const event=(e:StorageEvent)=>{if(!isGuestStorageKey(e.key))return;readGuest();if(ownerRef.current==='guest')void refresh()};window.addEventListener('storage',event);return()=>window.removeEventListener('storage',event)},[readGuest,refresh])
 const begin=()=>{const current=auth?.getSnapshot(),who=storageOwner(current);if(!usable(who)||who!==ownerRef.current)throw Error(current?.status==='error'?'로그인 확인에 실패해 저장을 보류했어요. 계정 다시 확인을 눌러 주세요.':'계정을 확인 중이에요. 확인 후 다시 시도해 주세요.');return {epoch:epoch.current,generation:current!.generation,owner:who}}
 const check=(token:ReturnType<typeof begin>)=>{const current=auth?.getSnapshot();if(token.epoch!==epoch.current||token.generation!==current?.generation||token.owner!==storageOwner(current))throw Error('계정 확인 상태가 바뀌었습니다. 현재 계정을 다시 확인해 주세요.')}
 const complete=async(token:ReturnType<typeof begin>)=>{check(token);setVersion(n=>n+1);await refresh();check(token)}
 const save=async(i:SaveInput)=>{validInput(i);const token=begin(),who=token.owner;if(who==='loading')throw Error('계정을 확인 중이에요.')
  if(who==='guest'){const live=(await libraryApi.resolve([i.target]))[0];check(token);if(!live?.available)throw Error('현재 공개되지 않은 정보는 새로 저장할 수 없어요.');if(i.day&&!live.current?.occurrences.some(o=>o.startDate<=i.day&&o.endDate>=i.day))throw Error('공개된 실제 운영일에서 방문일을 선택해 주세요.');const item=store.save(i);await complete(token);return guestIndex([item])[0]}
  const result=await libraryApi.save(i);check(token);await complete(token);return result.item
 }
 const remove=async(row:MemoryIndex)=>{const token=begin();if(ownerRef.current==='guest')store.remove(row.id,row.revision);else{if(ownerRef.current==='loading')return;await libraryApi.remove(row.id,row.revision)}await complete(token)}
 const edit=async(row:MemoryEntry,note:string,day:string,hall:string)=>{const token=begin();if(ownerRef.current==='guest'){if(day!==row.day&&day&&(!row.available||!row.current?.occurrences.some(o=>o.startDate<=day&&o.endDate>=day)))throw Error('공개된 실제 운영일에서 방문일을 선택해 주세요.');store.update(row.id,{note,day,hall},row.revision);}else await libraryApi.edit(row.id,{revision:row.revision,note,day,hall});await complete(token)}
 const visit=async(row:MemoryEntry,day:string,visited:boolean)=>{const token=begin();if(!day||day>seoulToday())throw Error('방문 표시는 오늘이나 지난 날짜에 남겨 주세요.')
  if(ownerRef.current==='guest'){
   if(visited){const current=(await libraryApi.resolve([row.target]))[0];check(token);if(!current?.available||!current.current?.occurrences.some(o=>o.startDate<=day&&o.endDate>=day))throw Error('현재 공개된 운영일을 확인해 주세요.');const ls=current.current.locations;if(ls.length&&!ls.some(l=>!l.startDate||!l.endDate||l.startDate<=day&&l.endDate>=day))throw Error('해당 날짜에는 이 부스의 참가 위치가 등록되어 있지 않아요.')}
   // A product save and a booth save share the explicit booth visit. Never infer visits from QR/open.
   for(const x of store.list().filter(x=>x.target.eventId===row.target.eventId&&x.target.participantId===row.target.participantId))store.update(x.key,{visitedDays:visited?[...new Set([...x.visitedDays,day])].sort():x.visitedDays.filter(d=>d!==day)})
  }else await libraryApi.visit(row.id,day,visited)
  await complete(token)
 }
 const importGuest=async()=>{const token=begin();if(!ownerRef.current.startsWith('member:'))throw Error('먼저 로그인해 주세요.');const expectedUserId=Number(ownerRef.current.slice(7));let imported=0;const issues:string[]=[]
  // Explicit user action only. Each operation is replay-safe; unresolved/conflicting drafts stay on this device.
  for(const g of store.list()){
   check(token)
   try{const result=await libraryApi.importOne({target:g.target,day:g.day,hall:g.hall},g.note,expectedUserId);check(token)
    if(result.result==='NOTE_CONFLICT'||result.result==='CONTEXT_CONFLICT'){issues.push('이미 계정에 저장한 메모·방문 계획과 다른 기록이 있어 기기 기록을 남겼어요.');continue}
    for(const day of g.visitedDays){await libraryApi.visit(result.item.id,day,true);check(token)}
    const current=store.list().find(x=>x.key===g.key)
    if(current&&JSON.stringify(current)===JSON.stringify(g)){store.remove(g.key);imported++}else issues.push('가져오는 중 기기 기록이 수정되어 원본을 남겼어요.')
   }catch(e){check(token);issues.push(e instanceof Error?e.message:'가져오기 실패')}
  }
  await complete(token);return {imported,remaining:store.list().length,issues:[...new Set(issues)]}
 }
 const clearGuest=()=>{store.clear();readGuest();if(ownerRef.current==='guest')void refresh();setVersion(n=>n+1)}
 const discardGuest=(key:string)=>{store.remove(key);readGuest();if(ownerRef.current==='guest')void refresh();setVersion(n=>n+1)}
 // Hide prior-account data during render, BEFORE an effect can run. Never persist member rows to browser storage.
 const scoped=state.owner===owner?state:{owner,index:[],loading:true,error:''}
 return <LibraryContext.Provider value={{...scoped,owner,version,guest:usable(owner)?guest:[],publicVersion,refreshPublic,resolvePublic,refresh,save,remove,edit,visit,importGuest,clearGuest,discardGuest}}>{children}</LibraryContext.Provider>
}

export async function resolveGuestPage(rows:GuestMemory[]):Promise<MemoryEntry[]> {
 const result:MemoryEntry[]=[]
 for(let i=0;i<rows.length;i+=200){const batch=rows.slice(i,i+200),resolved=await libraryApi.resolve(batch.map(g=>g.target)),byKey=new Map(resolved.map(r=>[targetKey(r.target),r]));for(const g of batch){const r=byKey.get(g.key);if(r)result.push(guestEntry(g,r))}}
 return result
}
