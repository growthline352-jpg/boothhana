import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useRemote } from '../../app/useRemote'
import { ErrorState, LoadingState } from '../../components/ui/States'
import { subcultureApi } from './api'
import { TasteTitle,TasteSectionTitle,TasteExploreNav,TasteSubjectCard,TasteCreatorCard,TasteEmpty } from './SubcultureUI'

export function SubcultureSearch() {
 const [params,setParams]=useSearchParams(),q=(params.get('q')||'').slice(0,100),[draft,setDraft]=useState(q)
 useEffect(()=>setDraft(q),[q])
 const subjects=useRemote(()=>subcultureApi.subjects(q),[q]),creators=useRemote(()=>subcultureApi.creators(q),[q])
 return <section className="content-wrap section-pad sc-live sc-taste-browse"><TasteTitle title={q?'‘'+q+'’ 검색 결과':'좋아하는 것을 찾아보세요'} body="캐릭터와 작품, 작가에서 다음 만남을 찾아보세요."/><form className="sc-taste-search" role="search" onSubmit={event=>{event.preventDefault();setParams({q:draft.trim()})}}><label className="discovery-sr-only" htmlFor="sc-unified-search">작품·캐릭터·작가 이름</label><input id="sc-unified-search" type="search" value={draft} maxLength={100} placeholder="작품, 캐릭터, 작가 이름으로 검색" onChange={event=>setDraft(event.target.value)}/><button>검색</button></form><TasteExploreNav q={q}/>
 <section className="sc-taste-section"><TasteSectionTitle title="작품·캐릭터"><Link to={'/subculture/subjects?'+new URLSearchParams({q})}>결과 더 보기 →</Link></TasteSectionTitle>{subjects.loading?<LoadingState/>:subjects.error?<ErrorState error={subjects.error} retry={()=>void subjects.reload()}/>:subjects.data?.length?<div className="sc-taste-subject-grid">{subjects.data.slice(0,8).map(s=><TasteSubjectCard key={s.id} subject={s}/>)}</div>:<TasteEmpty title="일치하는 작품·캐릭터가 없어요" body="목록에 없는 캐릭터도 직접 관심에 추가할 수 있어요."><Link className="btn secondary" to="/account/interests">직접 관심에 추가</Link></TasteEmpty>}</section>
 <section className="sc-taste-section"><TasteSectionTitle title="작가·서클"><Link to={'/subculture/creators?'+new URLSearchParams({q})}>결과 더 보기 →</Link></TasteSectionTitle>{creators.loading?<LoadingState/>:creators.error?<ErrorState error={creators.error} retry={()=>void creators.reload()}/>:creators.data?.length?<div className="sc-taste-creator-grid">{creators.data.slice(0,6).map(c=><TasteCreatorCard key={c.id} creator={c}/>)}</div>:<TasteEmpty title="일치하는 작가·서클이 없어요" body="다른 이름이나 서클명으로 검색해 보세요."/>}</section>
 </section>
}
