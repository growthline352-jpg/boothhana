import { Link,useLocation,useSearchParams } from 'react-router'
import { useEffect,useState } from 'react'
import { useAuth } from '../../app/useAuth'
import { useRemote } from '../../app/useRemote'
import { ErrorState,LoadingState } from '../../components/ui/States'
import { EventComments } from '../catalog/EventComments'
import { ownershipApi } from '../support/ownershipApi'
import { eventDateLabel } from '../discovery/browse'
import { TasteSectionTitle } from './SubcultureUI'
export function selectedReviewEvent(current:number,requested:string|null,available:{id:number}[]){
 const candidate=Number(requested)
 return requested&&available.some(event=>event.id===candidate)?candidate:current
}
export function EventEditionReviews({eventId,name}:{eventId:number;name:string}){
 const location=useLocation(),[params,setParams]=useSearchParams(),page=Math.max(0,Math.min(1000,Math.trunc(Number(params.get('editionPage'))||0)))
 const auth=useAuth(),[drafts,setDrafts]=useState<Record<number,string>>({})
 useEffect(()=>setDrafts({}),[auth.user?.id,eventId])
 const history=useRemote(()=>ownershipApi.history(eventId,page),[eventId,page])
 const selected=selectedReviewEvent(eventId,params.get('reviewEvent'),history.data?.items||[]),previous=selected!==eventId
 const chosen=history.data?.items.find(row=>row.id===selected)
 function move(next:number){const query=new URLSearchParams(params);query.set('editionPage',String(next));query.delete('reviewEvent');setParams(query,{preventScrollReset:true,state:location.state})}
 return <section className="sc-taste-edition-reviews"><TasteSectionTitle title="이전의 만남은 어땠나요?" note="지난 회차의 경험을 읽고, 다녀온 회차에 이야기를 남겨보세요."/>
 {history.loading?<LoadingState label="공개된 지난 회차를 확인하고 있어요"/>:history.error?<ErrorState error={history.error} retry={()=>void history.reload()}/>:<><label className="sc-taste-edition-select">후기를 볼 회차<select value={selected} onChange={event=>{const query=new URLSearchParams(params);if(Number(event.target.value)===eventId)query.delete('reviewEvent');else query.set('reviewEvent',event.target.value);setParams(query,{preventScrollReset:true,state:location.state})}}><option value={eventId}>이번 회차 · {name}</option>{history.data?.items.map(row=><option key={row.id} value={row.id}>다른 회차 · {row.edition||row.name} · {eventDateLabel(row.occurrences)}</option>)}</select></label>{previous&&<p className="sc-taste-edition-notice">선택한 다른 회차의 후기예요. 이번 회차의 장소·운영·판매 정보와 다를 수 있어요. <Link to={'/discover/'+selected+'?section=reviews'}>{chosen?.name} 행사 안내 →</Link></p>}{!history.data?.items.length&&<p>연결된 공개 회차가 아직 없어요. 이번 회차의 이야기부터 확인하세요.</p>}{(page>0||(history.data?.total||0)>20)&&<nav className="sc-live-pagination" aria-label="다른 회차 목록 페이지"><button disabled={!page} onClick={()=>move(page-1)}>이전 회차 목록</button><span>{page+1}페이지</span><button disabled={(page+1)*20>=(history.data?.total||0)} onClick={()=>move(page+1)}>다음 회차 목록</button></nav>}<EventComments key={selected} eventId={selected} draft={drafts[selected]||''} onDraftChange={body=>setDrafts(old=>({...old,[selected]:body}))}/></>}
 </section>
}
