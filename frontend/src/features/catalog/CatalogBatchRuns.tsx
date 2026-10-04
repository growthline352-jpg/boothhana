import {useState} from 'react'
import {Link} from 'react-router'
import {useRemote} from '../../app/useRemote'
import {LoadingState,ErrorState,EmptyState} from '../../components/ui/States'
import {catalogApi} from './api'
import {labels,Pager} from './Shared'
import {imageStates} from './imageHealth'

export function CatalogBatchRuns(){
 const [page,setPage]=useState(0),data=useRemote(()=>catalogApi.runs(page),[page])
 return <><p>행사 수집과 이미지 보완의 실행 결과입니다. 승인 대기·저장 실패는 공개 확인 완료 건수에 포함하지 않습니다.</p>
 <button className="btn secondary" onClick={()=>void data.reload()}>새로고침</button>
 {data.loading?<LoadingState/>:data.error?<ErrorState error={data.error} retry={()=>void data.reload()}/>:!data.data?.items.length?<EmptyState title="실행 기록이 없습니다" description="수집 서버의 예약 작업을 확인해 주세요."/>:data.data.items.map(r=>{
  const imageJob=r.summary.job==='IMAGE_REPAIR'||r.summary.job==='IMAGE_STORAGE'
  return <article className="panel catalog-history" key={r.runId}>
   <h3>{r.summary.job==='IMAGE_REPAIR'?'이미지 누락 보완':r.summary.job==='IMAGE_STORAGE'?'승인된 대표 이미지 저장':'행사 수집'} · {labels[r.state]||r.state}</h3>
   <p>시작 {new Date(r.startedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} · 최근 통신 {new Date(r.heartbeatAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</p>
   {imageJob?<p>이번 처리 {r.summary.processed??0}건 · 재시도·검토 대기 {r.summary.unresolvedCount??0}건 · 다음 처리 차례 {r.summary.dueDeferred??0}건</p>:<p>{r.scope.startDate} ~ {r.scope.endDate}</p>}
   <p>{r.summary.counts&&Object.entries(r.summary.counts).map(([k,v])=>`${imageStates[k]||k}: ${v}`).join(' · ')}</p>
   {!!r.summary.imageTasks?.length&&<details open><summary>확인이 필요한 행사 {r.summary.unresolvedCount}건</summary>{r.summary.imageTasks.map(t=><p key={t.eventId}><Link to={`?event=${t.eventId}&imageReview=1`}>{t.name}</Link> · {imageStates[t.state]||t.state}<small>{t.nextAction}</small></p>)}{(r.summary.unresolvedCount??0)>r.summary.imageTasks.length&&<p>나머지 행사는 행사 목록의 대표 이미지 필터에서 확인하세요.</p>}</details>}
   {!!r.summary.receipts&&<details><summary>서버 수신 결과</summary>{Object.entries(r.summary.receipts).map(([key,v])=><p key={key}>{key} · {v.status} · 신규 {v.inserted} / 변경 {v.changed} / 동일 {v.unchanged} / 제외 {v.rejected}</p>)}</details>}
   {!imageJob&&<details><summary>미수집·제한·오류 {r.summary.issues?.length||0}건</summary>{r.summary.issues?.map((s,i)=><p key={i}>{s}</p>)}</details>}
   {imageJob&&!r.summary.imageTasks?.length&&r.summary.issues?.map((s,i)=><p className="form-alert" key={i}>{s}</p>)}<small>{r.runId}</small>
  </article>
 })}{data.data&&<Pager page={page} total={data.data.total} change={setPage}/>}</>
}
