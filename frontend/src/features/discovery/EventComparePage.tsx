import { useState } from 'react'
import { Link,useSearchParams } from 'react-router'
import { useRemote } from '../../app/useRemote'
import { publicRead } from '../../api/client'
import { publicCatalogApi,type PublicEventSummary } from '../catalog/api'
import { categories } from './categories'
import { compareIds,editionId } from './compare'
import { eventDateLabel,eventTimeLabels } from './browse'
import { labels,SafeLink } from '../catalog/Shared'
import { BookingBadge } from '../catalog/BookingBadge'
import { SaveButton } from '../library/SaveButton'
import { ContentImage } from '../../components/ui/ContentImage'
import { eventSubjectLabels } from '../interests/taxonomy'
import './explore.css'

export function EventComparePage(){
 const [params,setParams]=useSearchParams(),ids=compareIds(params.get('ids'))
 const [category,setCategory]=useState('SUBCULTURE'),[draft,setDraft]=useState(''),[q,setQ]=useState(''),[page,setPage]=useState(0)
 const chosen=useRemote("features/discovery/EventComparePage:EventComparePage:chosen", ()=>ids.length?publicRead<PublicEventSummary[]>(`/api/public/catalog/events/compare?ids=${ids.join(',')}`):Promise.resolve([]),[ids.join(',')])
 const search=new URLSearchParams({category,q,page:String(page),size:'12',sort:'DATE_ASC'})
 const candidates=useRemote("features/discovery/EventComparePage:EventComparePage:candidates", ()=>ids.length<2?publicCatalogApi.browse(search.toString()):Promise.resolve({items:[],page:0,size:12,total:0}),[category,q,page,ids.length])
 const update=(values:number[])=>{const next=new URLSearchParams(params);if(values.length)next.set('ids',values.join(','));else next.delete('ids');setParams(next,{preventScrollReset:true})}
 const topics=(event:PublicEventSummary['event'])=>eventSubjectLabels(event.subcategory,event.subjects)
 const rows=chosen.data??[],selectedEditions=rows.map(editionId)
 const candidateRows=candidates.data?.items.filter(r=>!selectedEditions.includes(editionId(r)))??[]
 return <section className="content-wrap section-pad explore-page"><header className="explore-heading"><div><p className="eyebrow">나에게 맞는 행사 고르기</p><h1>행사 비교</h1><p>두 행사의 일정과 입장 조건을 함께 확인하세요.</p></div><Link className="btn secondary" to="/discover?view=results">행사 목록</Link></header>
 {chosen.error?<div role="alert" className="notice-banner">선택한 행사를 확인하지 못했어요. <button className="btn secondary" onClick={()=>void chosen.reload()}>다시 확인</button></div>:chosen.loading?<p role="status">현재 공개된 정보를 확인하고 있어요.</p>:<>
 {ids.length>rows.length&&<p role="status">같은 회차이거나 공개 안내가 없는 선택은 정리가 필요해요. <button className="btn secondary" onClick={()=>update(rows.map(r=>r.id))}>선택 정리</button></p>}
 <div className="compare-slots">{[0,1].map(index=>{const row=rows[index];return <div className={row?"compare-slot is-filled":"compare-slot"} key={row?.id??index}>{row?<><div className="compare-poster"><ContentImage url={row.banner?.url} kind="event" eventType={row.event.subcategory} alt=""/></div><small>{labels[row.event.subcategory]}</small><h2>{row.event.name}</h2><button className="btn secondary" onClick={()=>update(ids.filter(id=>id!==row.id))} aria-label={`${row.event.name} 비교에서 빼기`}>선택 해제</button></>:<><strong>{index+1}번째 행사</strong><p>아래에서 비교할 행사를 선택하세요.</p></>}</div>})}</div>
 {rows.length>0&&<div className="compare-facts"><table><caption className="discovery-sr-only">선택한 행사 비교</caption><thead><tr><th scope="col">확인할 내용</th>{rows.map(r=><th scope="col" key={r.id}>{r.event.name}</th>)}</tr></thead><tbody>
 <tr><th scope="row">날짜·시간</th>{rows.map(r=><td key={r.id}>{eventDateLabel(r.event.occurrences)}<small>{eventTimeLabels(r.event.occurrences).join(' · ')}</small></td>)}</tr>
 <tr><th scope="row">장소</th>{rows.map(r=><td key={r.id}>{(r.operatingPlaces||[{eventId:r.id,event:r.event}]).map(p=><div key={p.eventId}>{r.operatingPlaces&&<small>{eventDateLabel(p.event.occurrences)}</small>}{p.event.venueName||'장소 확인 필요'}<small>{p.event.address||'주소 확인 필요'}</small>{p.event.address&&<SafeLink url={`https://map.kakao.com/?q=${encodeURIComponent(p.event.address)}`}>지도 ↗</SafeLink>}</div>)}</td>)}</tr>
 <tr><th scope="row">입장·예매</th>{rows.map(r=><td key={r.id}>{(r.operatingPlaces||[{eventId:r.id,event:r.event}]).map(p=><div key={p.eventId}>{r.operatingPlaces&&<small>{eventDateLabel(p.event.occurrences)} · {p.event.venueName}</small>}{p.event.admission||'입장 조건 확인 필요'}<BookingBadge event={p.event}/>{p.event.visitorGuide?.tickets.filter(t=>t.sourceUrl&&t.checkedOn&&t.reservationUrl).map(t=><p key={t.id}><SafeLink url={t.reservationUrl}>{t.name} ↗</SafeLink></p>)}</div>)}</td>)}</tr>
 <tr><th scope="row">내용·주제</th>{rows.map(r=><td key={r.id}>{topics(r.event).join(' · ')||labels[r.event.subcategory]}<p className="compare-description">{r.event.description}</p></td>)}</tr>
 </tbody></table></div>}
 <div className="compare-actions">{rows.map(r=><div key={r.id}><Link className="btn primary" to={`/discover/${r.id}`}>상세 보기</Link><SaveButton target={{type:'EVENT',eventId:r.id,id:r.id,participantId:null}}/>{r.event.sources.find(s=>s.access==='ORIGINAL'&&['OFFICIAL','ORGANIZER_SOCIAL'].includes(s.kind))&&<SafeLink url={r.event.sources.find(s=>s.access==='ORIGINAL'&&['OFFICIAL','ORGANIZER_SOCIAL'].includes(s.kind))!.url}>공식 안내 ↗</SafeLink>}</div>)}</div>
 </>}
 {ids.length<2&&<section className="compare-picker" aria-labelledby="compare-picker-title"><h2 id="compare-picker-title">비교할 행사 찾기</h2><form className="explore-search" onSubmit={e=>{e.preventDefault();setQ(draft.trim());setPage(0)}}><label><span>분야</span><select className="select" value={category} onChange={e=>{setCategory(e.target.value);setPage(0)}}>{categories.map(c=><option key={c.code} value={c.code}>{c.label}</option>)}</select></label><label><span>행사명·장소</span><input className="input" value={draft} onChange={e=>setDraft(e.target.value)} maxLength={100}/></label><button className="btn primary" type="submit">검색</button></form>
 {candidates.loading?<p role="status">행사 검색 중…</p>:candidates.error?<p role="alert">검색하지 못했어요. <button className="btn secondary" onClick={()=>void candidates.reload()}>다시 시도</button></p>:<><div className="compare-candidates">{candidateRows.map(r=><button key={r.id} onClick={()=>update([...ids,r.id])}><strong>{r.event.name}</strong><span>{eventDateLabel(r.event.occurrences)} · {r.event.venueName||'장소 미확인'}</span><small>비교에 추가 +</small></button>)}</div>{!candidateRows.length&&<p role="status">{candidates.data?.items.length?'검색된 행사는 이미 비교에 담겨 있어요. 다른 행사명이나 분야로 찾아보세요.':'검색 결과가 없어요. 분야나 검색어를 바꿔 보세요.'}</p>}<nav className="row-actions" aria-label="비교 후보 페이지"><button className="btn secondary" disabled={!page} onClick={()=>setPage(p=>p-1)}>이전</button><span>{page+1} / {Math.max(1,Math.ceil((candidates.data?.total??0)/12))}</span><button className="btn secondary" disabled={(page+1)*12>=(candidates.data?.total??0)} onClick={()=>setPage(p=>p+1)}>다음</button></nav></>}
 </section>}
 <p className="item-meta">비교에는 현재 공개된 정보만 사용합니다. 미확인은 무료·예약 불필요를 뜻하지 않아요.</p></section>
}
