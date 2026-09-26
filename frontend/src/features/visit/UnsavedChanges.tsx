import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useBlocker } from 'react-router'
import { sameValue } from '../catalog/reviewChanges'
const warning='저장하지 않은 변경사항이 있어요. 저장하지 않고 이동할까요?'
interface UnsavedContextValue {set:(_key:string,_dirty:boolean)=>void;confirm:()=>boolean;hasUnsaved:boolean}
const Context=createContext<UnsavedContextValue>({set:(_key:string,_dirty:boolean)=>{},confirm:()=>true,hasUnsaved:false})
export function UnsavedChangesProvider({children}:{children:ReactNode}) {
  const values=useRef(new Map<string,boolean>()),[count,setCount]=useState(0)
  const set=useCallback((key:string,dirty:boolean)=>{
    if(Boolean(values.current.get(key))===dirty)return
    if(dirty)values.current.set(key,true);else values.current.delete(key)
    setCount(values.current.size)
  },[])
  const confirm=useCallback(()=>{
    if(!values.current.size)return true
    if(!window.confirm(warning))return false
    return true
  },[])
  const blocker=useBlocker(count>0)
  useEffect(()=>{if(blocker.state==='blocked'){if(confirm())blocker.proceed();else blocker.reset()}},[blocker,confirm])
  useEffect(()=>{
    if(!count)return
    const leave=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue=''}
    window.addEventListener('beforeunload',leave);return()=>window.removeEventListener('beforeunload',leave)
  },[count])
  const value=useMemo(()=>({set,confirm,hasUnsaved:count>0}),[set,confirm,count])
  return <Context.Provider value={value}>{children}{count>0&&<div className="visit-unsaved" role="status">저장하지 않은 수정사항이 있어요.</div>}</Context.Provider>
}
export function useHasUnsaved(){return useContext(Context).hasUnsaved}
export function useUnsavedGuard(){return useContext(Context).confirm}
export function useDirty(key:string,initial:unknown,current:unknown) {
  const {set}=useContext(Context),dirty=!sameValue(initial,current)
  useLayoutEffect(()=>{set(key,dirty)},[key,dirty,set])
  useEffect(()=>()=>set(key,false),[key,set])
  return ()=>set(key,false)
}
