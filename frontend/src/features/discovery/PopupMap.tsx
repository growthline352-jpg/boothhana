import {useEffect,useRef,useState} from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type {PopupPin} from './popupLocations'

export interface NamedPopupPin extends PopupPin {name:string;number:number}
export default function PopupMap({pins,selected,select,focusRequest=0}:{pins:NamedPopupPin[];selected:number|null;select:(id:number)=>void;focusRequest?:number}){
 const container=useRef<HTMLDivElement>(null),map=useRef<L.Map|null>(null),layer=useRef<L.LayerGroup|null>(null),action=useRef(select)
 action.current=select;const [error,setError]=useState(false),extent=useRef(pins);extent.current=pins
 const fit=()=>{const current=map.current;if(!current||current.getSize().x<=0)return
  const points=extent.current.map(p=>[p.latitude,p.longitude] as L.LatLngTuple)
  if(points.length>1)current.fitBounds(L.latLngBounds(points),{padding:[40,40],maxZoom:16,animate:false})
  else current.setView(points[0]||[37.5665,126.9780],points.length?16:11,{animate:false})
 }
 const fitAction=useRef(fit);fitAction.current=fit
 const draw=useRef(()=>{})
 draw.current=()=>{
  const current=map.current,markers=layer.current;if(!current||!markers)return;markers.clearLayers()
  const groups:NamedPopupPin[][]=[]
  pins.forEach(pin=>{const pixel=current.latLngToContainerPoint([pin.latitude,pin.longitude]),group=groups.find(g=>pixel.distanceTo(current.latLngToContainerPoint([g[0].latitude,g[0].longitude]))<44)
   if(group)group.push(pin);else groups.push([pin])
  })
  for(const group of groups){
   const p=group[0],label=group.length>1?`가까운 팝업 ${group.length}곳 보기`:`${p.number}. ${p.name}`
   const element=document.createElement('span');element.className=`popup-pin${group.some(pin=>(pin.display_event_id??pin.event_id)===selected)?' is-selected':''}`;element.textContent=group.length>1?`${group.length}곳`:String(p.number)
   const marker=L.marker([p.latitude,p.longitude],{icon:L.divIcon({html:element,className:'popup-marker',iconSize:[44,44],iconAnchor:[22,44]}),title:label,alt:label}).addTo(markers)
   marker.getElement()?.setAttribute('aria-label',label)
   const tooltip=document.createElement('span');tooltip.textContent=group.map(pin=>pin.name).join(' · ');marker.bindTooltip(tooltip)
   if(group.length===1)marker.on('click',()=>action.current(p.display_event_id??p.event_id))
   else{const choices=document.createElement('div');choices.className='popup-map-choices'
    group.forEach(pin=>{const button=document.createElement('button');button.type='button';button.textContent=`${pin.number}. ${pin.name}`;button.addEventListener('click',()=>{action.current(pin.display_event_id??pin.event_id);current.closePopup()});choices.append(button)})
    marker.bindPopup(choices,{minWidth:180,maxWidth:280})
   }
  }
 }
 useEffect(()=>{
  if(!container.current)return
  const current=L.map(container.current,{center:[37.5665,126.9780],zoom:11,scrollWheelZoom:false});map.current=current;layer.current=L.layerGroup().addTo(current)
  const tiles=L.tileLayer(import.meta.env.VITE_ITINERARY_TILE_URL||'https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,referrerPolicy:'origin',attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'})
  tiles.on('loading',()=>setError(false));tiles.on('tileerror',()=>setError(true));tiles.addTo(current)
  current.on('zoomend',()=>draw.current())
  const observer=new ResizeObserver(()=>{current.invalidateSize({pan:false});fitAction.current();draw.current()});observer.observe(container.current)
  return()=>{observer.disconnect();current.remove();map.current=null;layer.current=null}
 },[])
 const pointsKey=JSON.stringify(pins.map(p=>[p.event_id,p.latitude,p.longitude]))
 useEffect(()=>fitAction.current(),[pointsKey])
 useEffect(()=>draw.current(),[pins,selected])
 useEffect(()=>{const current=map.current;if(!current||selected===null)return
  const chosen=extent.current.filter(p=>(p.display_event_id??p.event_id)===selected).map(p=>[p.latitude,p.longitude] as L.LatLngTuple)
  if(chosen.length>1)current.fitBounds(L.latLngBounds(chosen),{padding:[40,40],maxZoom:16})
  else if(chosen.length)current.setView(chosen[0],Math.max(current.getZoom(),15))
 },[selected,focusRequest])
 return <div className="popup-map-frame"><div ref={container} className="popup-map" role="region" aria-label="팝업 위치 지도"/><button type="button" className="popup-map-overview" onClick={fit}>전체 위치</button>{error&&<p className="popup-map-error" role="status">지도 배경을 불러오지 못했어요. 행사 목록과 지도 링크를 이용해 주세요.</p>}</div>
}
