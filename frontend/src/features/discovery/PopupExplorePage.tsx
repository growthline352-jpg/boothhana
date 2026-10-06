import {discoveryFeatures} from './features'
import {lazy,Suspense,useEffect,useMemo,useState} from 'react'
import {Link,useSearchParams} from 'react-router'
import {publicRead} from '../../api/client'
import {useRemote} from '../../app/useRemote'
import {type PublicEventSummary} from '../catalog/api'
import {seoulToday,periodRange,rangeError,eventDateLabel,eventTimeLabels} from './browse'
import {ContentImage} from '../../components/ui/ContentImage'
import {SaveButton} from '../library/SaveButton'
import {BookingBadge} from '../catalog/BookingBadge'
import {SafeLink} from '../catalog/Shared'
import {DiscoveryIcon} from './DiscoveryIcon'
import {compareHref} from './compare'
import {popupAddressQuery,resolvePopupLocations,storedPopupPins,type PopupPlace,type PopupPin} from './popupLocations'
import './explore.css'
const PopupMap=lazy(()=>import('./PopupMap'))
interface PopupResult {items:PublicEventSummary[];places:PopupPlace[];total:number;limit:number}
export function PopupExplorePage(){
 const [params,setParams]=useSearchParams(),today=seoulToday(),week=periodRange('week',today),weekend=periodRange('weekend',today)
 const from=params.get('from')||week.from,to=params.get('to')||week.to,neighborhood=['SEONGSU','YEONNAM'].includes(params.get('neighborhood')||'')?params.get('neighborhood')!:''
 const error=rangeError(from,to)||((Date.parse(to)-Date.parse(from))/86400000>31?'31일 이내로 골라 주세요.':'')
 const query=new URLSearchParams({from,to,neighborhood})
 const data=useRemote(()=>error?Promise.resolve({items:[],places:[],total:0,limit:100}):publicRead<PopupResult>(`/api/public/catalog/popups?${query}`),[from,to,neighborhood,error])
 const [selected,setSelected]=useState<number|null>(null),[view,setView]=useState('list'),[retry,setRetry]=useState(0),[focusRequest,setFocusRequest]=useState(0)
 const update=(patch:Record<string,string>)=>{const next=new URLSearchParams(params);Object.entries(patch).forEach(([k,v])=>v?next.set(k,v):next.delete(k));setParams(next,{preventScrollReset:true});setSelected(null)}
 const rows=useMemo(()=>data.data?.items??[],[data.data])
 const places=useMemo(()=>data.data?.places??[],[data.data])
 const seed=useMemo(()=>storedPopupPins(places),[places])
 const [locations,setLocations]=useState<{source:PopupPlace[];pins:PopupPin[];busy:boolean}|null>(null)
 useEffect(()=>{
  if(view!=='map'||data.loading||!data.data)return
  let active=true;setLocations({source:places,pins:seed,busy:true})
  void resolvePopupLocations(places,pins=>{if(active)setLocations({source:places,pins,busy:true})},()=>active).then(pins=>{if(active)setLocations({source:places,pins,busy:false})})
  return()=>{active=false}
 },[view,places,seed,retry,data.loading,data.data])
 const busy=view==='map'&&(locations?.source!==places||locations.busy)
 const pins=useMemo(()=>(locations?.source===places?locations.pins:seed).flatMap(p=>{const index=rows.findIndex(r=>r.id===(p.display_event_id??p.event_id));return index<0?[]:[{...p,name:rows[index].event.name,number:index+1}]}),[locations,places,seed,rows])
 const mapped=new Set(pins.map(p=>p.display_event_id??p.event_id)),current=rows.find(r=>r.id===selected)
 const selectPin=(id:number)=>{setSelected(id);requestAnimationFrame(()=>document.getElementById(`popup-${id}`)?.scrollIntoView({behavior:'smooth',block:'nearest'}))}
 const selectLocation=(id:number)=>{setSelected(id);setFocusRequest(n=>n+1);if(window.matchMedia('(max-width:900px)').matches)document.querySelector('.popup-map-column')?.scrollIntoView({behavior:'smooth',block:'start'})}
 const canRetry=places.some(p=>!pins.some(pin=>pin.event_id===p.event_id)&&popupAddressQuery(p.address))
 return <section className="content-wrap section-pad explore-page popup-explore-page"><header className="explore-heading"><div><p className="eyebrow">날짜와 동네로 찾기</p><h1>동네 팝업</h1><p>가고 싶은 팝업을 찾고 가까운 곳도 함께 둘러보세요.</p></div><Link className="btn secondary" to="/discover?category=popups&view=results">모든 팝업 보기 <DiscoveryIcon name="arrow" size={16}/></Link></header>
 <div className="popup-controls"><div role="group" aria-label="팝업 동네" className="row-actions">{[['','서울 전체'],['SEONGSU','성수·서울숲'],['YEONNAM','연남']].map(([id,label])=><button type="button" className={`btn ${id===neighborhood?'primary':'secondary'}`} aria-pressed={id===neighborhood} key={id} onClick={()=>update({neighborhood:id})}>{label}</button>)}</div><div className="explore-search"><label><span>시작일</span><input className="input" type="date" value={from} onChange={e=>update({from:e.target.value})}/></label><label><span>종료일</span><input className="input" type="date" min={from} value={to} onChange={e=>update({to:e.target.value})}/></label><div className="row-actions"><button className="btn secondary" onClick={()=>update(week)}>앞으로 7일</button><button className="btn secondary" onClick={()=>update(weekend)}>이번 주말</button></div></div></div>
 {error?<p role="alert">{error}</p>:data.loading?<p role="status">팝업 일정을 확인하고 있어요.</p>:data.error?<div className="panel" role="alert"><p>팝업을 불러오지 못했어요.</p><button className="btn secondary" onClick={()=>void data.reload()}>다시 확인</button></div>:<>
 <div className="explore-heading popup-result-heading"><p role="status"><strong>{data.data?.total??0}개</strong> · 선택한 기간에 열리는 팝업</p>{rows.length>0&&<div className="row-actions" role="group" aria-label="팝업 보기 방식"><button className="btn secondary" aria-pressed={view==='list'} onClick={()=>setView('list')}><DiscoveryIcon name="grid" size={16}/> 목록</button><button className="btn secondary" aria-pressed={view==='map'} onClick={()=>setView('map')}><DiscoveryIcon name="pin" size={16}/> 지도</button></div>}</div>
 {!rows.length?<div className="panel"><h2>이 기간에 소개할 팝업이 아직 없어요</h2><p>다른 날짜를 고르거나 서울 전체에서 찾아보세요.</p><div className="row-actions">{neighborhood&&<button className="btn primary" onClick={()=>update({neighborhood:''})}>서울 전체 보기</button>}<Link className="btn secondary" to="/support/guest?category=FEATURE_REQUEST">누락된 행사 알려주기</Link></div></div>:<div className={`popup-results${view==='map'?' is-map':''}`}>
 {view==='map'&&<div className="popup-map-column"><Suspense fallback={<div className="popup-map" role="status">지도를 불러오고 있어요.</div>}><PopupMap pins={pins} selected={selected} focusRequest={focusRequest} select={selectPin}/></Suspense><div className="popup-map-status" role="status" aria-live="polite">{busy?'행사 주소로 위치를 확인하고 있어요.':`지도에 ${mapped.size}개 행사를 표시했어요.`}{mapped.size<rows.length&&!busy&&<><span>위치를 확인하지 못한 {rows.length-mapped.size}개도 목록에서 볼 수 있어요.</span>{canRetry&&<button className="btn secondary" onClick={()=>setRetry(n=>n+1)}>위치 다시 확인</button>}</>}</div>{current&&<aside className="popup-selected" aria-live="polite"><strong>{current.event.name}</strong><p>{current.event.address||'주소 확인 필요'}</p><Link className="btn primary" to={`/discover/${current.id}`}>상세 보기</Link><button className="btn secondary" onClick={()=>setSelected(null)}>선택 닫기</button></aside>}</div>}
 <div className="popup-grid">{rows.map((r,index)=><article id={`popup-${r.id}`} className={`popup-card${r.id===selected?' is-selected':''}`} key={r.id}><Link className="popup-card-title" to={`/discover/${r.id}`}><ContentImage url={r.banner?.url} kind="event" eventType={r.event.subcategory} alt=""/><h2>{view==='map'&&<span className="popup-card-number">{index+1}</span>}{r.event.name}</h2></Link><p>{eventDateLabel(r.event.occurrences)}<small>{eventTimeLabels(r.event.occurrences).join(' · ')}</small></p><p>{r.event.venueName||'장소 확인 필요'}<small>{r.event.address||'주소 확인 필요'}</small></p><p>{r.event.admission||'입장 조건 확인 필요'}</p><BookingBadge event={r.event}/><div className="row-actions"><SaveButton target={{type:'EVENT',eventId:r.id,id:r.id,participantId:null}}/>{view==='map'&&mapped.has(r.id)&&<button className="btn secondary" aria-pressed={r.id===selected} onClick={()=>selectLocation(r.id)}>위치 선택</button>}{r.event.address&&<SafeLink url={`https://map.kakao.com/?q=${encodeURIComponent(r.event.address)}`}>길찾기 ↗</SafeLink>}{discoveryFeatures.comparison&&<Link to={compareHref([r.id])}>다른 행사와 비교</Link>}</div></article>)}</div></div>}
 {(data.data?.total??0)>100&&<p>가까운 일정 100개를 표시합니다. 날짜나 동네를 좁혀 주세요.</p>}
 {neighborhood&&<p className="item-meta">주소로 동네를 확인한 행사만 표시합니다. 주소가 확인되지 않은 팝업은 서울 전체에서 볼 수 있어요.</p>}</>}
 </section>
}
