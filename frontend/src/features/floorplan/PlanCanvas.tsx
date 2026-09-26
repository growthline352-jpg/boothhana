import { useEffect, useRef, useState } from 'react'
import type { PointerEvent, ReactNode } from 'react'
import type { Shape, Point } from './api'
import { center, rectangle, safePoints } from './geometry'
import { anchoredScroll, clampZoom, fitShapeZoom } from './viewport'
import { openCatalogDialog } from '../catalog/dialogLifecycle'
import './floorplan.css'
/** Fixed SVG renderer: model-generated code and markup are never executed. */
export function PlanCanvas({width,height,imageUrl,shapes,selected,onSelect,highlight=[],linkedIds,focusRequest=0,editable=false,onChange,renderSelection}:{width:number;height:number;imageUrl:string|null;shapes:Shape[];selected:string|null;onSelect:(id:string,trigger:HTMLElement)=>void;highlight?:string[];linkedIds?:string[];focusRequest?:number;editable?:boolean;onChange?:(shapes:Shape[])=>void;renderSelection?:(expanded:boolean,showDetails:(content:ReactNode,title:string,trigger:HTMLElement)=>void)=>ReactNode}) {
  const svg=useRef<SVGSVGElement>(null),viewport=useRef<HTMLDivElement>(null),dialog=useRef<HTMLDialogElement>(null),fullButton=useRef<HTMLButtonElement>(null)
  const [zoom,setZoom]=useState(1),[original,setOriginal]=useState(true),[drawing,setDrawing]=useState(false),[expanded,setExpanded]=useState(false)
  const [detail,setDetail]=useState<{content:ReactNode;title:string}|null>(null)
  const detailHeading=useRef<HTMLHeadingElement>(null),detailTrigger=useRef<HTMLElement|null>(null)
  const detailsWereOpen=useRef(false)
  const showDetails=(content:ReactNode,title:string,trigger:HTMLElement)=>{detailTrigger.current=trigger;setDetail({content,title})}
  const backToMap=()=>setDetail(null)
  useEffect(()=>{
    if(detail){detailsWereOpen.current=true;detailHeading.current?.focus({preventScroll:true})}
    else if(detailsWereOpen.current){detailsWereOpen.current=false;if(detailTrigger.current?.isConnected)detailTrigger.current.focus({preventScroll:true})}
  },[detail])
  useEffect(()=>{setDetail(null)},[selected])
  const zoomRef=useRef(zoom);zoomRef.current=zoom
  const pointers=useRef(new Map<number,Point>()),suppress=useRef(false)
  const drag=useRef<{kind:'vertex';id:string;index:number}|{kind:'draw';start:Point}|{kind:'pan';x:number;y:number;left:number;top:number;shape:string|null}|null>(null)
  const pinch=useRef<{distance:number;zoom:number;point:Point}|null>(null)
  const valid=shapes.filter(s=>safePoints(s.points)),w=Math.max(1,width),h=Math.max(1,height),ratio=w/h
  const frame=useRef(0),wasExpanded=useRef(false)
  useEffect(()=>()=>cancelAnimationFrame(frame.current),[])
  useEffect(()=>{if(expanded&&dialog.current){wasExpanded.current=true;return openCatalogDialog(dialog.current,dialog.current.querySelector('button'),null)}if(wasExpanded.current){fullButton.current?.focus({preventScroll:true});wasExpanded.current=false}},[expanded])
  const at=(point:Point,z:number,anchor?:Point)=>{
    const v=viewport.current;if(!v)return
    const scroll=anchoredScroll(point,z,v.clientWidth,ratio,anchor||{x:v.clientWidth/2,y:v.clientHeight/2})
    cancelAnimationFrame(frame.current);frame.current=requestAnimationFrame(()=>v.scrollTo({...scroll,behavior:'auto'}))
  }
  const scale=(z:number,point?:Point,anchor?:Point)=>{
    const v=viewport.current;if(!v)return
    const p=point||{x:(v.scrollLeft+v.clientWidth/2)/(v.clientWidth*zoomRef.current),y:(v.scrollTop+v.clientHeight/2)/(v.clientWidth*zoomRef.current/ratio)}
    const next=clampZoom(z);zoomRef.current=next;setZoom(next);at(p,next,anchor)
  }
  const focus=()=>{const s=valid.find(s=>s.id===selected),v=viewport.current;if(!s||!v||!v.clientWidth)return;scale(fitShapeZoom(s.points,v.clientWidth,ratio,v.clientHeight),center(s.points))}
  useEffect(()=>{if(selected&&!editable)focus()},[selected,expanded,focusRequest]) // Selection alone triggers focus; manual pan/zoom never resets it.
  useEffect(()=>{
    const v=viewport.current;if(!v||typeof ResizeObserver==='undefined')return
    let previous=v.clientWidth
    const observer=new ResizeObserver(()=>{const current=v.clientWidth;if(previous===0&&current>0&&selected&&!editable)focus();previous=current})
    observer.observe(v);return()=>observer.disconnect()
  },[selected,expanded,editable])
  const coords=(ev:PointerEvent<SVGSVGElement>):Point=>{
    const m=svg.current?.getScreenCTM();if(!m)return{x:0,y:0}
    const p=new DOMPoint(ev.clientX,ev.clientY).matrixTransform(m.inverse())
    return{x:Math.min(1,Math.max(0,p.x/w)),y:Math.min(1,Math.max(0,p.y/h))}
  }
  const select=(id:string)=>{if(viewport.current)onSelect(id,viewport.current)}
  const down=(ev:PointerEvent<SVGSVGElement>)=>{
    if(ev.button!==0)return
    pointers.current.set(ev.pointerId,{x:ev.clientX,y:ev.clientY})
    ev.currentTarget.setPointerCapture(ev.pointerId)
    const target=ev.target as Element,vertex=target.closest('[data-vertex]'),shape=target.closest('[data-shape]')
    const v=viewport.current;if(!v)return
    if(pointers.current.size===2&&!editable){
      const [a,b]=[...pointers.current.values()],box=v.getBoundingClientRect(),mid={x:(a.x+b.x)/2-box.left,y:(a.y+b.y)/2-box.top}
      pinch.current={distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),zoom:zoomRef.current,point:{x:(v.scrollLeft+mid.x)/(v.clientWidth*zoomRef.current),y:(v.scrollTop+mid.y)/(v.clientWidth*zoomRef.current/ratio)}}
      drag.current=null;suppress.current=true;ev.preventDefault();return
    }
    suppress.current=false
    if(editable&&vertex)drag.current={kind:'vertex',id:vertex.getAttribute('data-owner')!,index:Number(vertex.getAttribute('data-vertex'))}
    else if(editable&&drawing)drag.current={kind:'draw',start:coords(ev)}
    else drag.current={kind:'pan',x:ev.clientX,y:ev.clientY,left:v.scrollLeft,top:v.scrollTop,shape:shape?.getAttribute('data-shape')||null}
    ev.preventDefault()
  }
  const move=(ev:PointerEvent<SVGSVGElement>)=>{
    if(!pointers.current.has(ev.pointerId))return
    pointers.current.set(ev.pointerId,{x:ev.clientX,y:ev.clientY})
    const pin=pinch.current,v=viewport.current
    if(pin&&pointers.current.size>=2&&v){
      const [a,b]=[...pointers.current.values()],box=v.getBoundingClientRect()
      scale(pin.zoom*Math.hypot(a.x-b.x,a.y-b.y)/pin.distance,pin.point,{x:(a.x+b.x)/2-box.left,y:(a.y+b.y)/2-box.top});return
    }
    const d=drag.current;if(!d)return
    if(d.kind==='vertex'&&onChange){const p=coords(ev);suppress.current=true;onChange(shapes.map(s=>s.id===d.id?{...s,points:s.points.map((q,i)=>i===d.index?p:q)}:s))}
    else if(d.kind==='pan'&&v){if(Math.hypot(ev.clientX-d.x,ev.clientY-d.y)>5)suppress.current=true;v.scrollLeft=d.left-(ev.clientX-d.x);v.scrollTop=d.top-(ev.clientY-d.y)}
  }
  const end=(ev:PointerEvent<SVGSVGElement>,canceled=false)=>{
    const d=drag.current,wasPinch=!!pinch.current
    pointers.current.delete(ev.pointerId);drag.current=null;pinch.current=null
    if(!canceled&&!wasPinch&&d?.kind==='draw'&&onChange){const p=coords(ev);if(Math.abs(p.x-d.start.x)>.002&&Math.abs(p.y-d.start.y)>.002){const s=rectangle('manual-'+crypto.randomUUID(),d.start,p);onChange([...shapes,s]);select(s.id)}}
    if(!canceled&&!wasPinch&&!suppress.current&&d?.kind==='pan'&&d.shape)select(d.shape)
    if(svg.current?.hasPointerCapture(ev.pointerId))svg.current.releasePointerCapture(ev.pointerId)
    if(pointers.current.size===1&&viewport.current){const p=[...pointers.current.values()][0];drag.current={kind:'pan',x:p.x,y:p.y,left:viewport.current.scrollLeft,top:viewport.current.scrollTop,shape:null};suppress.current=true}
  }
  const selection=renderSelection?.(expanded,showDetails)
  const content=<div className="floorplan-canvas"><div className="floorplan-toolbar">
    <button className="btn secondary floorplan-zoom-button" type="button" onClick={()=>scale(zoom-.5)} disabled={zoom<=1} aria-label="배치도 축소">− <span>축소</span></button><output aria-label={`현재 확대율 ${Math.round(zoom*100)}퍼센트`}>{Math.round(zoom*100)}%</output>
    <button className="btn secondary floorplan-zoom-button" type="button" onClick={()=>scale(zoom+.5)} disabled={zoom>=12} aria-label="배치도 확대"><span>확대</span> ＋</button>
    <button className="btn secondary" type="button" onClick={()=>{zoomRef.current=1;setZoom(1);viewport.current?.scrollTo(0,0)}}>전체 보기</button>
    <button className="btn secondary" type="button" disabled={!selected} onClick={focus}>선택 위치로</button>
    {imageUrl&&<label><input type="checkbox" checked={original} onChange={ev=>setOriginal(ev.target.checked)}/> 원본 배경</label>}
    {!editable&&<button ref={!expanded?fullButton:undefined} className="btn secondary" type="button" onClick={()=>setExpanded(!expanded)}>{expanded?'전체화면 닫기':'배치도 전체화면'}</button>}
    {editable&&<button type="button" className={`btn ${drawing?'primary':'secondary'}`} onClick={()=>setDrawing(!drawing)}>{drawing?'영역 그리기 중':'사각 부스 추가'}</button>}
  </div>{selection}<div className="floorplan-viewport" ref={viewport} tabIndex={0} aria-label="배치도. 손가락 두 개로 확대하고 끌어서 이동할 수 있어요." style={{aspectRatio:`${w}/${h}`}}>
  <svg ref={svg} role="group" aria-label="부스번호별 배치도. 검색 결과에서도 선택할 수 있습니다." viewBox={`0 0 ${w} ${h}`} style={{width:`${zoom*100}%`,aspectRatio:`${w}/${h}`}}
    onPointerDown={down} onPointerMove={move} onPointerUp={ev=>end(ev)} onPointerCancel={ev=>end(ev,true)}>
    <rect width={w} height={h} fill="white"/>{original&&imageUrl&&<image href={imageUrl} width={w} height={h} preserveAspectRatio="none"/>}
    {valid.map(s=>{const c=center(s.points),active=s.id===selected,unlinked=linkedIds!==undefined&&!linkedIds.includes(s.id)
      return <g key={s.id} data-shape={s.id} role="button" tabIndex={0} aria-label={`부스 ${s.label||'번호 미확인'}${unlinked?' · 참가자 연결 미확인':''}`} aria-pressed={active}
        onClick={ev=>{if(ev.detail===0)select(s.id)}} onKeyDown={ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();select(s.id)}}}>
        <polygon className={`floorplan-region ${unlinked?'is-unlinked':''} ${active?'is-selected':''} ${highlight.includes(s.id)?'is-highlighted':''}`} points={s.points.map(p=>`${p.x*w},${p.y*h}`).join(' ')} vectorEffect="non-scaling-stroke"/>
        <text x={c.x*w} y={c.y*h} textAnchor="middle" dominantBaseline="central" className="floorplan-label" fontSize={Math.max(10,w/110)}>{s.label||'?'}</text>
      </g>})}
    {editable&&valid.find(s=>s.id===selected)?.points.map((p,i)=><circle key={i} data-vertex={i} data-owner={selected} cx={p.x*w} cy={p.y*h} r={w/150} className="floorplan-handle" aria-hidden="true"/>)}
  </svg></div>
  {linkedIds!==undefined&&<p className="floorplan-legend"><span>□ 위치번호만</span><span>■ 부스정보 연결</span><span>■ 파란 테두리: 선택 위치</span></p>}
  <small>손가락 두 개로 확대하고 끌어서 이동하세요. 작은 부스는 검색 결과로 선택하면 자동으로 확대됩니다. 현위치·최단 경로 안내는 제공하지 않습니다.</small>
  </div>
  return expanded ? <dialog ref={dialog} className="floorplan-fullscreen" aria-label={detail ? `${detail.title} 판매정보` : '배치도 전체화면'}
    onCancel={ev=>{ev.preventDefault();if(detail)backToMap();else setExpanded(false)}}>
    {/* Keep the canvas mounted and laid out: returning from details restores the exact pan/zoom. */}
    <div className="floorplan-full-map" style={detail?{visibility:'hidden'}:undefined} inert={detail?true:undefined} aria-hidden={detail?true:undefined}>
      {content}<button className="btn primary wide" onClick={()=>setExpanded(false)}>선택 위치 확인 · 전체화면 닫기</button>
    </div>
    {detail&&<section className="floorplan-full-details"><div className="floorplan-details-heading">
      <button className="btn secondary" type="button" onClick={backToMap}>← 같은 지도 위치로 돌아가기</button>
      <h2 ref={detailHeading} tabIndex={-1}>{detail.title}</h2></div>{detail.content}</section>}
  </dialog> : <>{content}</>
}
