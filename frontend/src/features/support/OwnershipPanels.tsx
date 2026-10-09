import { useState } from 'react'
import { Link } from 'react-router'
import { useRemote } from '../../app/useRemote'
import { ownershipApi } from './ownershipApi'
import { supportPath } from './rules'
import { ErrorState } from '../../components/ui/States'
const disclaimer='운영 주체와 계정의 관계를 확인한 표시입니다. 행사 품질·거래 안전·이번 회차 참가 확정을 보증하지 않습니다.'
export function OwnershipPanel({eventId,participantId}:{eventId:number;participantId?:number}){
 const state=useRemote("features/support/OwnershipPanels:OwnershipPanel:state", ()=>ownershipApi.info(eventId),[eventId])
 const verified=participantId?state.data?.exhibitors.filter(x=>x.participantId===participantId):state.data?.organizers
 const direct=participantId!=null&&state.data?.directParticipantIds?.includes(participantId)
 const target={namespace:'CATALOG' as const,type:participantId?'PARTICIPANT' as const:'EVENT' as const,eventId,id:participantId??eventId}
 return <section className="ownership-panel" aria-label={participantId?'부스 운영자 확인':'행사 주최자 확인'}>
  {direct&&<><span className="chip">직접 등록</span><p className="support-note">등록자가 직접 작성한 정보입니다. 주최 측 참가 승인이나 부스 배정 여부는 공식 안내를 확인해 주세요.</p></>}
  {!direct&&!!verified?.length&&<><span className="chip active">{participantId?'운영자 확인':'주최자 확인'}</span><span> {verified.map(x=>x.name).join(' · ')}</span><p className="support-note">{disclaimer}{participantId?' 공동 부스에서는 표시된 업체만 확인되었습니다.':''}</p></>}
  {state.error&&<p role="status">운영자 확인 정보를 불러오지 못했습니다. <button type="button" onClick={()=>void state.reload()}>다시 확인</button></p>}
  {!direct&&<Link className="support-report-link" to={supportPath('CLAIM',target)+(participantId?'':'&category=ORGANIZER')}>{participantId?'이 부스의 운영자이신가요?':'이 행사의 주최자이신가요?'}</Link>}
  <Link className="support-report-link" to="/support/management">내 행사·부스 관리</Link>
 </section>
}
export function EventHistory({eventId}:{eventId:number}){
 const [page,setPage]=useState(0),info=useRemote("features/support/OwnershipPanels:EventHistory:info", ()=>ownershipApi.info(eventId),[eventId]),state=useRemote("features/support/OwnershipPanels:EventHistory:state", ()=>ownershipApi.history(eventId,page),[eventId,page])
 if(info.loading||state.loading)return null
 if(info.error||state.error)return <ErrorState error={info.error||state.error!} retry={()=>{void info.reload();void state.reload()}}/>
 if(!info.data?.series.length)return null
 return <section className="panel event-history"><h2>{info.data.series[0].name} · 다른 개최 회차</h2><p>회차별 일정·참가 부스·사진·댓글을 비교해 보세요. 현재 회차의 주최자 확인이 다른 회차까지 보증하지는 않습니다.</p>{state.data?.items.map(x=><article key={x.id}><Link to={`/discover/${x.id}`}><strong>{x.name}</strong></Link><p>{x.edition} · {x.occurrences.map(o=>o.startDate===o.endDate?o.startDate:`${o.startDate} ~ ${o.endDate}`).join(', ')}</p></article>)}{!state.data?.items.length&&<p>공개된 다른 회차가 아직 없습니다.</p>}<div className="row-actions"><button disabled={!page} onClick={()=>setPage(page-1)}>이전</button><span>{page+1}페이지</span><button disabled={(page+1)*20>=(state.data?.total??0)} onClick={()=>setPage(page+1)}>다음</button></div></section>
}
