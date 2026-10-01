import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router'
import { pageScrollKey } from './scrollKey'

const positions=new Map<string,number>()
/** Explicit catalogue return links and browser POP restore after data and layout are ready. */
export function usePageScroll(ready:boolean) {
  const location=useLocation(), navigation=useNavigationType()
  const key=pageScrollKey(location.pathname,location.search)
  const last=useRef(''), restored=useRef(false)
  const wanted=useRef(0)
  useLayoutEffect(()=>{
    const detail=/^\/discover\/\d+\/?$/.test(location.pathname)
    if(key===last.current)return
    const returnLink=Boolean((location.state as {catalogRestore?:boolean}|null)?.catalogRestore)
    wanted.current=(navigation==='POP'||returnLink)?positions.get(key)||0:0
    restored.current=false;last.current=key
    if(!detail||navigation!=='REPLACE')window.scrollTo(0,wanted.current)
  },[key,location.pathname,navigation,location.state])
  useEffect(()=>{
    if(!ready||restored.current)return
    let stopped=false,frame=0,attempt=0
    const cancel=()=>{stopped=true}
    const restore=()=>{
      if(stopped)return
      window.scrollTo(0,wanted.current)
      if(window.scrollY>=wanted.current-2||attempt++>30){restored.current=true;return}
      frame=requestAnimationFrame(restore)
    }
    frame=requestAnimationFrame(restore)
    window.addEventListener('wheel',cancel,{passive:true});window.addEventListener('touchstart',cancel,{passive:true})
    return()=>{stopped=true;cancelAnimationFrame(frame);window.removeEventListener('wheel',cancel);window.removeEventListener('touchstart',cancel)}
  },[key,ready])
  useLayoutEffect(()=>()=>{positions.set(key,window.scrollY);if(positions.size>100)positions.delete(positions.keys().next().value!)},[key])
}
