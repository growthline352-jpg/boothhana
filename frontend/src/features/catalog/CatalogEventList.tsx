import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { useRemote } from '../../app/useRemote'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States'
import { categories } from '../discovery/categories'
import { catalogApi } from './api'
import { labels, Pager } from './Shared'
import { imageStates } from './imageHealth'

export function CatalogEventList({open}:{open:(id:number,images?:boolean)=>void}) {
  const [params,setParams]=useSearchParams()
  const page=Math.max(0,Math.min(100000,Number(params.get('page'))||0)),q=params.get('q')||'',category=params.get('category')||'',state=params.get('state')||'',publication=params.get('publication')||''
  const [draft,setDraft]=useState(q)
  const image=params.get('image')||''
  useEffect(()=>setDraft(q),[q])
  const data=useRemote(()=>catalogApi.events(page,{q,category,state,publication,image}),[page,q,category,state,publication,image])
  const update=(patch:Record<string,string>)=>setParams(previous=>{const next=new URLSearchParams(previous);next.delete('page');for(const [k,v] of Object.entries(patch)){if(v)next.set(k,v);else next.delete(k)}return next})
  const search=(e:FormEvent)=>{e.preventDefault();update({q:draft.trim()})}
  return <><form className="panel support-controls" onSubmit={search}>
    <label className="field"><span>행사명·장소</span><input className="input" type="search" maxLength={100} value={draft} onChange={e=>setDraft(e.target.value)}/></label><button className="btn primary">검색</button>
    <label className="field"><span>분야</span><select className="select" value={category} onChange={e=>update({category:e.target.value})}><option value="">전체 분야</option>{categories.map(c=><option key={c.code} value={c.code}>{c.label}</option>)}</select></label>
    <label className="field"><span>행사 검토 상태</span><select className="select" value={state} onChange={e=>update({state:e.target.value})}><option value="">전체 상태</option>{['PENDING','REVIEWED','EXCLUDED'].map(s=><option key={s} value={s}>{labels[s]}</option>)}</select></label>
    <label className="field"><span>공개 여부</span><select className="select" value={publication} onChange={e=>update({publication:e.target.value})}><option value="">전체</option><option value="PUBLISHED">공개 중</option><option value="UNPUBLISHED">비공개</option><option value="PENDING">공개 중 · 검토 대기 있음</option></select></label>
    <label className="field"><span>대표 이미지</span><select className="select" value={image} onChange={e=>update({image:e.target.value})}><option value="">전체</option>{['MISSING','WAITING_REVIEW','WAITING_STORAGE','STORAGE_FAILED','SELECTION_BLOCKED','READY'].map(s=><option key={s} value={s}>{imageStates[s]}</option>)}</select></label>
    <button className="btn secondary" type="button" onClick={()=>void data.reload()}>새로고침</button>
  </form>{data.loading?<LoadingState/>:data.error?<ErrorState error={data.error} retry={()=>void data.reload()}/>:!data.data?.items.length?<EmptyState title="조건에 맞는 행사가 없습니다" description="검색어와 분야·검토·공개·이미지 조건을 확인해 주세요."/>:<div className="table-wrap"><table><thead><tr><th>행사</th><th>검토</th><th>부스·판매</th><th>대표 이미지</th><th>공개</th><th>관리</th></tr></thead><tbody>{data.data.items.map(e=><tr key={e.id}><td><strong>{e.name}</strong><small>{e.startDate} · {labels[e.subcategory]}</small></td><td>{labels[e.reviewState]}{!!e.taxonomyIssues?.length&&<small title={e.taxonomyIssues.join("\n")}>취향 주제 확인 필요</small>}{e.hasPendingChanges&&<small>행사·부스·판매정보 검토 대기</small>}</td><td>부스 {e.participantCount} · 판매 {e.salesCount}</td><td><strong>{imageStates[e.bannerState||'MISSING']||e.bannerState}</strong>{!!e.pendingBannerCount&&<small>사용 검토 대기 {e.pendingBannerCount}개</small>}{!!e.waitingBannerCount&&<small>저장 대기 {e.waitingBannerCount}개{e.failedBannerCount?` · 실패 ${e.failedBannerCount}개`:''}</small>}<button className="btn subtle" onClick={()=>open(e.id,true)}>이미지 검토</button></td><td>{e.published?'공개 중':'비공개'}</td><td><button className="btn secondary" onClick={()=>open(e.id)}>관리</button></td></tr>)}</tbody></table></div>}
    {data.data&&<Pager page={page} total={data.data.total} change={n=>update({page:String(n)})}/>}<p className="item-meta">건수는 확보한 정보 기준입니다. 검토 대기에는 이미 일부 필드가 공개된 업체 수정도 포함됩니다.</p>
  </>
}
