import { useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { creatorApi } from '../../api'
import { useRemote } from '../../app/useRemote'
import { PageHeader } from '../../components/layout/PageHeader'
import { ErrorState, LoadingState, EmptyState } from '../../components/ui/States'
import { publicCatalogApi } from '../catalog/api'
import { useUnsaved } from '../support/useSupportUnsaved'
import { creatorCatalogApi, type CatalogBoothInput, type CatalogBoothValue } from './catalogApi'
import type { BoothSummary } from '../../types'

export function CatalogBoothList(){
 const state=useRemote("features/creator/CreatorCatalogBoothPage:CatalogBoothList:state", creatorCatalogApi.mine,[])
 return <section className="panel"><div className="panel-header"><h2>직접 등록한 공개 행사 부스</h2><Link className="btn secondary" to="/creator/catalog/events">행사 찾아 등록하기</Link></div>
 {state.loading?<LoadingState/>:state.error?<ErrorState error={state.error} retry={()=>void state.reload()}/>:!state.data?.length?<p>참가할 행사 화면에서 ‘내 부스 등록’을 선택해 주세요. 계정당 행사별 1개까지 등록할 수 있습니다.</p>:state.data.map(b=><article className="list-row" key={b.participantId}><div><h3>{b.name}</h3><p>{b.eventName}{b.reviewState==='EXCLUDED'?' · 공개 제외됨':''}</p></div>{b.reviewState!=='EXCLUDED'&&<div className="row-actions"><Link className="btn secondary" to={`/creator/catalog/events/${b.eventId}/booths/${b.participantId}`}>부스 수정</Link><Link className="btn secondary" to={`/support/management?event=${b.eventId}&participant=${b.participantId}&type=PRODUCTS`}>상품 관리</Link><Link to={`/discover/${b.eventId}/booths/${b.participantId}`}>공개 화면</Link></div>}</article>)}
 </section>
}
export function CreatorCatalogBoothPage(){
 const [saved,setSaved]=useState(false)
 const params=useParams(),event=Number(params.eventId),participant=Number(params.participantId)||0
 const state=useRemote("features/creator/CreatorCatalogBoothPage:CreatorCatalogBoothPage:state", async()=>{
  const [value,booths,availability,existing]=await Promise.all([publicCatalogApi.event(String(event)),creatorApi.booths(),creatorCatalogApi.availability(event),participant?creatorCatalogApi.detail(event,participant):Promise.resolve(null)])
  return {value,booths,availability,existing}
 },[event,participant])
 if(state.loading)return <LoadingState/>
 if(state.error)return <ErrorState error={state.error} retry={()=>void state.reload()}/>
 if(!state.data)return null
 const {value,booths,availability,existing}=state.data
 return <><PageHeader eyebrow="Creator · Booth" title={existing?'행사별 부스 수정':'내 부스 등록'} description={value.event.name} actions={<div className="row-actions"><Link className="btn secondary" to="/creator/catalog/events">공개 행사 찾기</Link><Link className="btn subtle" to={`/discover/${event}`}>공개 행사 보기</Link></div>}/>
 {saved&&<p className="notice-banner" role="status">부스 정보를 저장했습니다.</p>}
 <p>새 부스는 저장하면 바로 공개됩니다. 이미 소개된 본인 부스가 있다면 부스 상세 화면에서 연결을 요청해 주세요. 기존 연결을 포함해 계정당 행사별 1개만 등록할 수 있습니다.</p>
 {!availability.eventOpen?<EmptyState title="부스 등록·수정이 마감된 행사입니다" description="종료되거나 일정이 취소·변경된 행사입니다."/>:!existing&&!availability.canRegister?<EmptyState title="이미 내 부스가 연결된 행사입니다" description="기존에 등록하거나 연결한 부스를 관리해 주세요." action={<div className="row-actions"><Link to="/creator/booths">내 부스 목록</Link><Link to="/support/management">연결한 부스 관리</Link></div>}/>:!booths.length?<EmptyState title="먼저 기본 부스를 만들어 주세요" description="기본 부스를 만든 다음 이 화면으로 돌아와 행사별 소개를 입력할 수 있습니다." action={<Link className="btn primary" to={`/creator/booths?returnTo=${encodeURIComponent(`/creator/catalog/events/${event}/booths/new`)}`}>기본 부스 만들기</Link>}/>:<BoothForm key={`${event}:${participant}:${existing?.revision??0}`} event={event} booths={booths} existing={existing} reload={()=>{setSaved(true);void state.reload()}}/>}
 </>
}
function BoothForm({event,booths,existing,reload}:{event:number;booths:BoothSummary[];existing:CatalogBoothValue|null;reload:()=>void}){
 const navigate=useNavigate(),p=existing?.data,base=booths.length===1?booths[0]:undefined,loc=p?.locations[0]
 const initial:CatalogBoothInput={boothId:existing?.boothId??base?.id??0,name:p?.registrationName??base?.name??'',description:p?.description??base?.intro??'',subjects:p?.subjects??[],boothNumber:loc?.code??'',startDate:loc?.startDate??'',endDate:loc?.endDate??''}
 const [form,setForm]=useState(initial),[subjects,setSubjects]=useState(initial.subjects.join(', ')),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const sending=useRef(false),dirty=JSON.stringify(initial)!==JSON.stringify(form)||subjects!==initial.subjects.join(', '),clear=useUnsaved(dirty&&!busy)
 const submit=async(e:FormEvent)=>{e.preventDefault();if(sending.current)return;sending.current=true;setBusy(true);setError('');try{
  const body={...form,subjects:subjects.split(',').map(s=>s.trim()).filter(Boolean)}
  const result=existing?await creatorCatalogApi.update(event,existing.participantId,existing.revision,body):await creatorCatalogApi.create(event,body)
  clear();if(existing){reload()}else navigate(`/creator/catalog/events/${event}/booths/${result.participantId}`,{replace:true})
 }catch(e){setError(e instanceof Error?e.message:'등록하지 못했습니다.')}finally{sending.current=false;setBusy(false)}}
 return <form className="panel form-panel" onSubmit={e=>void submit(e)}><fieldset disabled={busy} style={{border:0,padding:0}}><div className="form-grid">
 <label className="field"><span>기본 부스</span><select className="select" required disabled={!!existing} value={form.boothId||''} onChange={e=>{const b=booths.find(b=>b.id===Number(e.target.value));setForm({...form,boothId:b?.id??0,name:b?.name??'',description:b?.intro??''})}}><option value="">선택해 주세요</option>{booths.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
 <label className="field"><span>이번 행사에서 사용할 부스명</span><input className="input" required maxLength={255} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
 <label className="field full"><span>이번 행사 부스 소개</span><textarea className="textarea" maxLength={1000} rows={5} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
 <label className="field"><span>작품·취향 주제 (쉼표로 구분)</span><input className="input" maxLength={1000} value={subjects} onChange={e=>setSubjects(e.target.value)}/></label>
 <label className="field"><span>부스 번호 (미정이면 비워두세요)</span><input className="input" maxLength={64} value={form.boothNumber} onChange={e=>setForm({...form,boothNumber:e.target.value})}/></label>
 <label className="field"><span>참가 시작일 (선택)</span><input className="input" type="date" required={!!form.endDate} value={form.startDate} onChange={e=>setForm({...form,startDate:e.target.value})}/></label>
 <label className="field"><span>참가 종료일 (선택)</span><input className="input" type="date" required={!!form.startDate} value={form.endDate} onChange={e=>setForm({...form,endDate:e.target.value})}/></label>
 </div><p className="item-meta">부스 소개와 상품은 행사별로 따로 관리합니다. 직접 등록은 주최 측 참가 승인이나 현장 부스 배정을 대신하지 않습니다.</p>
 {error&&<p className="form-alert" role="alert">{error}</p>}<div className="row-actions"><button className="btn primary" disabled={!form.boothId}>{busy?'저장 중…':existing?'수정 저장':'등록하고 공개하기'}</button>{existing&&<><Link className="btn secondary" to={`/support/management?event=${event}&participant=${existing.participantId}&type=PRODUCTS`}>이번 행사 상품 관리</Link><Link to={`/discover/${event}/booths/${existing.participantId}`}>공개 화면 보기</Link></>}</div></fieldset></form>
}
