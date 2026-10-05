import {useEffect,useState} from 'react'
import {Link,useNavigate,useParams} from 'react-router'
import {useAuth} from '../../app/useAuth'
import {useRemote} from '../../app/useRemote'
import {ItineraryMap} from './ItineraryMap'
import {areas,kindNames,minuteTime,planIssues,timeMinutes,validatePlan,writePlan} from './model'
import {copySharedPlan,safeShareUrl,shareApi} from './sharing'
import './itinerary.css'

export function SharedItineraryPage(){
 const {token=''}=useParams(),navigate=useNavigate(),auth=useAuth(),[message,setMessage]=useState(''),[selected,setSelected]=useState(''),[view,setView]=useState('list')
 const owner=auth.status==='authenticated'&&auth.user?`member:${auth.user.id}`:auth.status==='anonymous'?'guest':''
 const result=useRemote(async()=>{if(!/^[\w-]{22}$/.test(token))throw new Error('공유 일정을 찾을 수 없어요.');const r=await shareApi.read(token);if(!validatePlan(r.plan))throw new Error('일정 정보를 확인하지 못했어요.');return r},[token])
 useEffect(()=>{const old=document.querySelector<HTMLMetaElement>('meta[name="referrer"]'),previous=old?.content,tag=old||document.createElement('meta');tag.name='referrer';tag.content='no-referrer';if(!old)document.head.append(tag);return()=>{if(old)old.content=previous||'';else tag.remove()}},[])
 const p=result.data?.plan,copy=()=>{if(!p||!owner)return;try{const next=copySharedPlan(p);writePlan(localStorage,`boothhana.itineraries.v1:${owner}`,next);navigate(`/itinerary?plan=${next.id}`)}catch{setMessage('이 브라우저에 저장하지 못했어요. 저장 공간을 확인해 주세요.')}}
 return <section className="it-page it-shared-page"><header className="it-heading"><div><span className="it-badge">공유 일정</span><h1>{p?.title||'공유된 하루 일정'}</h1><p>받은 코스를 확인하고, 내 일정으로 복사해 바꿔보세요.</p></div><Link className="btn secondary" to="/itinerary">내 일정</Link></header>
  {result.loading?<p role="status">공유 일정을 불러오고 있어요.</p>:result.error?<div className="it-empty" role="alert"><h2>일정을 열지 못했어요</h2><p>{result.error.message}</p><button className="btn secondary" onClick={()=>void result.reload()}>다시 확인</button></div>:p&&<>
   <div className="it-shared-summary"><strong>{p.day} · {p.start}–{p.end}</strong><span>{p.purpose==='EVENT'?'행사 참여':'데이트'} · {p.stops.length}곳</span><button className="btn primary" disabled={!owner} onClick={copy}>내 일정으로 복사</button></div>
   {message&&<p role="alert">{message}</p>}{planIssues(p).length>0&&<div className="it-conflicts"><strong>방문 시간 확인이 필요해요</strong><ul>{planIssues(p).map(x=><li key={x}>{x}</li>)}</ul></div>}
   <div className="it-mobile-tabs" role="group" aria-label="공유 일정 보기"><button aria-pressed={view==='list'} onClick={()=>setView('list')}>일정</button><button aria-pressed={view==='map'} onClick={()=>setView('map')}>지도</button></div>
   <div className={`it-shared-grid view-${view}`}><div className="it-shared-stops">{p.stops.map((s,i)=><article className={selected===s.id?'selected':''} id={`shared-stop-${s.id}`} key={s.id}><button className="it-shared-stop-title" onClick={()=>setSelected(s.id)}><span className="it-map-number">{i+1}</span><div><small>{s.start}–{minuteTime(timeMinutes(s.start)+s.duration)} · {kindNames[s.kind]}</small><h2>{s.name}</h2></div></button><p>{s.address||'주소 확인 필요'}</p>{s.note&&<p className="it-shared-note">{s.note}</p>}<div className="it-share-actions">{safeShareUrl(s.url)&&<a href={safeShareUrl(s.url)} target="_blank" rel="noopener noreferrer">{s.kind==='EVENT'?'행사 상세':'장소 정보'} ↗</a>}{s.point?<a href={`https://map.kakao.com/link/map/${encodeURIComponent(s.name)},${s.point.lat},${s.point.lng}`} target="_blank" rel="noopener noreferrer">카카오맵 ↗</a>:<small>지도 위치 확인 필요</small>}</div></article>)}</div>
    <aside className="it-map-panel"><h2>방문 동선</h2><ItineraryMap stops={p.stops} selected={selected} center={p.stops.find(s=>s.point)?.point||areas.find(a=>a.id===p.area)?.point||areas[0].point} onSelect={id=>{setSelected(id);setView('list');requestAnimationFrame(()=>{const row=document.getElementById(`shared-stop-${id}`);row?.scrollIntoView({block:'nearest'});row?.querySelector('button')?.focus({preventScroll:true})})}}/><p className="it-map-caption">점선은 방문 순서예요. 실제 이동 경로·소요 시간과 다를 수 있어요.</p></aside>
   </div><p className="it-check-note">{new Date(result.data!.createdAt).toLocaleDateString('ko-KR')}에 공유한 내용 · {new Date(result.data!.expiresAt).toLocaleDateString('ko-KR')}까지 열람 가능</p>
  </>}
 </section>
}
