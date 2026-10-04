import {discoveryFeatures} from './features'
import {useEffect,useMemo,useRef,useState} from 'react'
import {Link,useSearchParams} from 'react-router'
import {publicRead} from '../../api/client'
import {useRemote} from '../../app/useRemote'
import {type PublicEventSummary} from '../catalog/api'
import {seoulToday,periodRange,rangeError,eventDateLabel,eventTimeLabels} from './browse'
import {ContentImage} from '../../components/ui/ContentImage'
import {SaveButton} from '../library/SaveButton'
import {BookingBadge} from '../catalog/BookingBadge'
import {SafeLink} from '../catalog/Shared'
import {compareHref} from './compare'
import './explore.css'
export interface PopupPlace {event_id:number;neighborhood:string;address:string;latitude:number|null;longitude:number|null;source_url:string;checked_on:string}
interface PopupResult {items:PublicEventSummary[];places:PopupPlace[];total:number;limit:number}
export function PopupExplorePage(){
 const [params,setParams]=useSearchParams(),weekend=periodRange('weekend',seoulToday())
 const from=params.get('from')||weekend.from,to=params.get('to')||weekend.to,neighborhood=['SEONGSU','YEONNAM'].includes(params.get('neighborhood')||'')?params.get('neighborhood')!:''
 const error=rangeError(from,to)||((Date.parse(to)-Date.parse(from))/86400000>31?'31일 이내로 골라 주세요.':'')
 const query=new URLSearchParams({from,to,neighborhood})
 const data=useRemote(()=>error?Promise.resolve({items:[],places:[],total:0,limit:100}):publicRead<PopupResult>(`/api/public/catalog/popups?${query}`),[from,to,neighborhood,error])
 const [selected,setSelected]=useState<number|null>(null),[view,setView]=useState('list')
 const update=(patch:Record<string,string>)=>{const next=new URLSearchParams(params);Object.entries(patch).forEach(([k,v])=>v?next.set(k,v):next.delete(k));setParams(next,{preventScrollReset:true});setSelected(null)}
 const rows=data.data?.items??[],pins=useMemo(()=>data.data?.places.filter(p=>p.latitude!==null&&p.longitude!==null)??[],[data.data])
 const key=import.meta.env.VITE_KAKAO_MAP_KEY as string|undefined
 const current=rows.find(r=>r.id===selected)
 return <section className="content-wrap section-pad explore-page"><header className="explore-heading"><div><p className="eyebrow">날짜와 동네로 찾기</p><h1>동네 팝업</h1><p>서울의 공개 팝업을 골라 방문을 준비하세요.</p></div><Link className="btn secondary" to="/discover?category=popups&view=results">서울·경기 전체</Link></header>
 <div className="popup-controls"><div role="group" aria-label="팝업 동네" className="row-actions">{[['','서울 전체'],['SEONGSU','성수·서울숲'],['YEONNAM','연남']].map(([id,label])=><button type="button" className={`btn ${id===neighborhood?'primary':'secondary'}`} aria-pressed={id===neighborhood} key={id} onClick={()=>update({neighborhood:id})}>{label}</button>)}</div><div className="explore-search"><label><span>시작일</span><input className="input" type="date" value={from} onChange={e=>update({from:e.target.value})}/></label><label><span>종료일</span><input className="input" type="date" min={from} value={to} onChange={e=>update({to:e.target.value})}/></label><button className="btn secondary" onClick={()=>update(weekend)}>이번 주말</button></div></div>
 {error?<p role="alert">{error}</p>:data.loading?<p role="status">팝업 일정을 확인하고 있어요.</p>:data.error?<div role="alert">팝업을 불러오지 못했어요. <button className="btn secondary" onClick={()=>void data.reload()}>다시 확인</button></div>:<>
 <div className="explore-heading"><p role="status">{data.data?.total??0}개 · 선택한 기간과 일정이 겹치는 팝업</p>{key&&pins.length>0&&<div className="row-actions" role="group" aria-label="팝업 보기 방식"><button className="btn secondary" aria-pressed={view==='list'} onClick={()=>setView('list')}>목록</button><button className="btn secondary" aria-pressed={view==='map'} onClick={()=>setView('map')}>지도</button></div>}</div>
 {view==='map'&&key&&pins.length>0&&<><PopupMap places={pins} apiKey={key} select={setSelected}/><p className="item-meta">지도에는 위치를 확인한 {pins.length}곳만 표시합니다. 나머지는 아래 목록에서 확인하세요.</p></>}
 {current&&<aside className="popup-selected" aria-live="polite"><strong>{current.event.name}</strong><p>{current.event.address}</p><Link className="btn primary" to={`/discover/${current.id}`}>상세 보기</Link><button className="btn secondary" onClick={()=>setSelected(null)}>선택 닫기</button></aside>}
 {!rows.length?<div className="panel"><h2>이 기간에 소개할 팝업이 아직 없어요</h2><p>다른 날짜를 고르거나 서울 전체에서 찾아보세요.</p>{neighborhood&&<button className="btn primary" onClick={()=>update({neighborhood:''})}>서울 전체 보기</button>}<Link className="btn secondary" to="/support/guest?category=FEATURE_REQUEST">누락된 행사 알려주기</Link></div>:<div className="popup-grid">{rows.map(r=><article className={`popup-card${r.id===selected?' is-selected':''}`} key={r.id}><Link to={`/discover/${r.id}`}><ContentImage url={r.banner?.url} kind="event" eventType={r.event.subcategory} alt=""/><h2>{r.event.name}</h2></Link><p>{eventDateLabel(r.event.occurrences)}<small>{eventTimeLabels(r.event.occurrences).join(' · ')}</small></p><p>{r.event.venueName||'장소 확인 필요'}<small>{r.event.address||'주소 확인 필요'}</small></p><p>{r.event.admission||'입장 조건 확인 필요'}</p><BookingBadge event={r.event}/><div className="row-actions"><SaveButton target={{type:'EVENT',eventId:r.id,id:r.id,participantId:null}}/>{r.event.address&&<SafeLink url={`https://map.kakao.com/?q=${encodeURIComponent(r.event.address)}`}>지도 ↗</SafeLink>}{discoveryFeatures.comparison&&<Link to={compareHref([r.id])}>다른 행사와 비교</Link>}</div></article>)}</div>}
 {(data.data?.total??0)>100&&<p>가까운 일정 100개를 표시합니다. 날짜나 동네를 좁혀 주세요.</p>}
 {neighborhood&&<p className="item-meta">공식 주소로 동네를 확인한 행사만 이 목록에 표시합니다. 동네 미확인 행사는 서울 전체에서 볼 수 있어요.</p>}</>}
 </section>
}

// The SDK is loaded only when the visitor explicitly chooses the map; no geolocation permission.
type Point=object
interface KakaoMaps {load:(fn:()=>void)=>void;LatLng:new(a:number,b:number)=>Point;Map:new(el:HTMLElement,options:object)=>{setBounds:(b:object)=>void};LatLngBounds:new()=>{extend:(p:Point)=>void};Marker:new(options:object)=>{setMap:(m:object|null)=>void};event:{addListener:(m:object,type:string,fn:()=>void)=>void;removeListener:(m:object,type:string,fn:()=>void)=>void}}
let sdk:Promise<KakaoMaps>|null=null
function loadMap(key:string):Promise<KakaoMaps>{
 if(sdk)return sdk
 sdk=new Promise<KakaoMaps>((resolve,reject)=>{const script=document.createElement('script');script.src=`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`;script.async=true
 const timer=window.setTimeout(()=>reject(new Error('지도 연결 지연')),15000)
 script.onload=()=>{const maps=(window as unknown as {kakao?:{maps:KakaoMaps}}).kakao?.maps;if(!maps){clearTimeout(timer);reject(new Error('지도 연결 실패'));return}maps.load(()=>{clearTimeout(timer);resolve(maps)})};script.onerror=()=>{clearTimeout(timer);reject(new Error('지도 연결 실패'))};document.head.append(script)
 }).catch(e=>{sdk=null;throw e});return sdk!
}
function PopupMap({places,apiKey,select}:{places:PopupPlace[];apiKey:string;select:(id:number)=>void}){
 const ref=useRef<HTMLDivElement>(null),action=useRef(select);action.current=select;const [error,setError]=useState('')
 useEffect(()=>{let active=true;let cleanup=()=>{};void loadMap(apiKey).then(maps=>{if(!active||!ref.current)return;const first=places[0],map=new maps.Map(ref.current,{center:new maps.LatLng(first.latitude!,first.longitude!),level:4}),bounds=new maps.LatLngBounds()
 const markers=places.map(p=>{const point=new maps.LatLng(p.latitude!,p.longitude!);bounds.extend(point);const marker=new maps.Marker({map,position:point,title:p.address}),click=()=>action.current(p.event_id);maps.event.addListener(marker,'click',click);return {marker,click}})
 if(places.length>1)map.setBounds(bounds);cleanup=()=>markers.forEach(({marker,click})=>{maps.event.removeListener(marker,'click',click);marker.setMap(null)})
 }).catch(()=>{if(active)setError('지도를 불러오지 못했어요. 아래 목록의 지도 링크를 이용해 주세요.')});return()=>{active=false;cleanup()}},[apiKey,places])
 return error?<p role="alert">{error}</p>:<div ref={ref} className="popup-map" role="region" aria-label="확인된 팝업 위치 지도"/>
}
