import {useEffect,useRef,useState} from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type {PlanStop,Point} from './model'

function fitMap(current:L.Map,points:L.LatLngTuple[],center:Point){
 if(current.getSize().x<=0||current.getSize().y<=0)return
 if(points.length>1)current.fitBounds(L.latLngBounds(points),{padding:[45,45],maxZoom:15,animate:false})
 else current.setView(points[0]||[center.lat,center.lng],14,{animate:false})
}
export function ItineraryMap({stops,selected,center,onSelect,onPick,picking=false}:{stops:PlanStop[];selected:string;center:Point;onSelect:(id:string)=>void;onPick?:(point:Point)=>void;picking?:boolean}){
 const container=useRef<HTMLDivElement>(null),map=useRef<L.Map|null>(null),markers=useRef<L.LayerGroup|null>(null),actions=useRef({onSelect,onPick,picking})
 actions.current={onSelect,onPick,picking};const [error,setError]=useState(false)
 const pointsKey=JSON.stringify(stops.flatMap(s=>s.point?[[s.point.lat,s.point.lng]]:[]))
 const extent=useRef({points:[] as L.LatLngTuple[],center});extent.current={points:JSON.parse(pointsKey) as L.LatLngTuple[],center}
 const draw=useRef(()=>{})
 draw.current=()=>{
  const current=map.current,layer=markers.current;if(!current||!layer)return;layer.clearLayers()
  const groups:{stop:PlanStop;index:number}[][]=[],points:L.LatLngExpression[]=[]
  stops.forEach((stop,index)=>{if(!stop.point)return;const point:L.LatLngTuple=[stop.point.lat,stop.point.lng];points.push(point)
   const pixel=current.latLngToContainerPoint(point),group=groups.find(g=>{const p=g[0].stop.point!;return pixel.distanceTo(current.latLngToContainerPoint([p.lat,p.lng]))<44})
   if(group)group.push({stop,index});else groups.push([{stop,index}])
  })
  groups.forEach(group=>{
   const first=group[0].stop,p=first.point!,numbers=group.map(s=>s.index+1).join('·'),label=group.length>1?`${numbers}. 가까운 장소 ${group.length}곳 보기`:`${numbers}. ${first.name}`
   const element=document.createElement('span');element.className=`it-map-pin${group.some(s=>s.stop.id===selected)?' selected':''}${group.length>1?' grouped':''}`;element.textContent=group.length>3?`${group[0].index+1}+${group.length-1}`:numbers
   const marker=L.marker([p.lat,p.lng],{icon:L.divIcon({html:element,className:'it-map-marker',iconSize:group.length>1?[50,34]:[34,34],iconAnchor:group.length>1?[25,34]:[17,34]}),title:label,alt:label}).addTo(layer)
   marker.getElement()?.setAttribute('aria-label',label)
   const tooltip=document.createElement('span');tooltip.textContent=group.map(s=>s.stop.name).join(' · ');marker.bindTooltip(tooltip)
   if(group.length===1)marker.on('click',()=>actions.current.onSelect(first.id))
   else{const choices=document.createElement('div');choices.className='it-map-choices'
    group.forEach(({stop,index})=>{const button=document.createElement('button');button.type='button';button.textContent=`${index+1}. ${stop.name}`;button.addEventListener('click',()=>{actions.current.onSelect(stop.id);current.closePopup()});choices.append(button)})
    marker.bindPopup(choices,{minWidth:170})
   }
  })
  if(points.length>1)L.polyline(points,{color:'#b84532',weight:3,opacity:.55,dashArray:'6 8',interactive:false}).addTo(layer)
 }
 useEffect(()=>{
  if(!container.current)return
  const current=L.map(container.current,{center:[center.lat,center.lng],zoom:14,scrollWheelZoom:false});map.current=current
  const tiles=L.tileLayer(import.meta.env.VITE_ITINERARY_TILE_URL||'https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'})
  tiles.on('tileerror',()=>setError(true));tiles.on('load',()=>setError(false));tiles.addTo(current);markers.current=L.layerGroup().addTo(current)
  current.on('click',(e:L.LeafletMouseEvent)=>{if(actions.current.picking)actions.current.onPick?.({lat:e.latlng.lat,lng:e.latlng.lng})})
  current.on('zoomend',()=>draw.current())
  const observer=new ResizeObserver(()=>{current.invalidateSize({pan:false});fitMap(current,extent.current.points,extent.current.center);draw.current()});observer.observe(container.current)
  return()=>{observer.disconnect();current.remove();map.current=null;markers.current=null}
 // Center changes are handled below without replacing the map or reloading tiles.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[])
 useEffect(()=>draw.current(),[stops,selected])
 useEffect(()=>{const current=map.current;if(current)fitMap(current,extent.current.points,extent.current.center)},[pointsKey,center.lat,center.lng])
 return <div className={`it-map-frame${picking?' is-picking':''}`}><div ref={container} className="it-map" role="region" aria-label={picking?'위치를 눌러 선택하는 지도':'일정 장소 지도'}/>{!picking&&<button className="it-map-overview" onClick={()=>{if(map.current)fitMap(map.current,extent.current.points,extent.current.center)}}>전체 동선</button>}{picking&&<div className="it-map-instruction">지도를 눌러 장소 위치를 선택하세요</div>}{error&&<div className="it-map-error" role="status">지도 배경 연결을 확인해 주세요. 장소 목록은 계속 사용할 수 있어요.</div>}</div>
}
