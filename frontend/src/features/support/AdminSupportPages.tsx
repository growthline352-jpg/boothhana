import { useRef,useState,type FormEvent } from 'react'
import { Link,useParams,useSearchParams } from 'react-router'
import { useRemote } from '../../app/useRemote'
import { PageHeader } from '../../components/layout/PageHeader'
import { ErrorState,EmptyState,LoadingState } from '../../components/ui/States'
import { Pager } from '../catalog/Shared'
import { supportApi,type Ticket,type TicketKind,type ActionInput } from './api'
import { Attachments,ReplyForm,TicketHeader,TicketContext,MessageThread } from './TicketViews'
import { kinds,statuses,resolutions,outcomeTone } from './rules'
import { useUnsaved } from './useSupportUnsaved'
const routes:Record<TicketKind,string>={REPORT:'/admin/reports',INQUIRY:'/admin/inquiries',CLAIM:'/admin/ownership'}
export function AdminSupportList({kind}:{kind:TicketKind}){
 const [params,setParams]=useSearchParams(),page=Math.max(0,Math.min(100000,Number(params.get('page'))||0)),status=params.get('status')??''
 const state=useRemote(()=>supportApi.list(kind,page,status,true),[kind,page,status])
 return <section className="support-page"><PageHeader eyebrow="고객지원" title={kind==='REPORT'?'신고 내역':kind==='INQUIRY'?'문의 내역':'업체 관리권 요청'} description="작성자에게 보이는 답변과 내부 메모를 구분하고, 처리 결과를 남깁니다."/><div className="support-controls"><label className="field"><span>처리 상태</span><select className="select" value={status} onChange={e=>setParams({status:e.target.value,page:'0'})}><option value="">전체</option>{Object.entries(statuses).map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label><button className="btn secondary" onClick={()=>void state.reload()}>새로고침</button></div>{state.loading?<LoadingState/>:state.error?<ErrorState error={state.error} retry={()=>void state.reload()}/>:!state.data?.items.length?<EmptyState title="해당 접수가 없습니다" description="분류와 상태 필터를 확인해 주세요."/>:<><div className="support-ticket-list">{state.data.items.map(t=><Link to={`/admin/support/${t.id}`} key={t.id} className="panel support-ticket-row"><div><small>{t.number} · {new Date(t.createdAt).toLocaleString('ko-KR')}</small><h3>{t.title}</h3>{t.resolution&&<small>{resolutions[t.resolution]??t.resolution}</small>}</div><span className={`chip ${outcomeTone(t.status)}`}>{statuses[t.status]}</span></Link>)}</div><Pager page={page} total={state.data.total} change={p=>setParams({status,page:String(p)})}/></>}</section>
}
export function AdminSupportDetail(){const {id=''}=useParams(),state=useRemote(()=>supportApi.detail(id,true),[id]);if(state.loading)return <LoadingState/>;if(state.error||!state.data)return <ErrorState error={state.error??new Error('접수 없음')} retry={()=>void state.reload()}/>;const t=state.data
 return <section className="support-page"><Link to={routes[t.kind]}>← {kinds[t.kind]} 목록</Link><TicketHeader ticket={t}/><div className="support-note">담당자: {t.assignedTo?`계정 #${t.assignedTo}`:'미배정'} · 작성자: {t.requesterId?`계정 #${t.requesterId}`:'비회원 로그인 문의'} · 버전 {t.revision}</div>{!!t.verifiedManagers?.length&&<p className="support-note">운영 관계가 확인된 업체: {t.verifiedManagers.map(x=>x.name).join(', ')}. 공동 부스 전체 편집권을 뜻하지 않습니다.</p>}
 <div className="support-admin-grid"><div><TicketContext ticket={t}/><MessageThread ticket={t}/><Attachments ticket={t} admin reload={state.reload}/><ReplyForm key={t.id} ticket={t} admin onSend={async m=>{state.setData(await supportApi.reply(id,m,true))}}/></div><aside>
 <TicketActions key={t.id} ticket={t} saved={state.setData}/>
 {t.currentTarget&&<section className="panel"><h2>현재 공개 정보</h2><p>{t.currentTarget.visible?t.currentTarget.label:'현재 비공개 또는 삭제된 대상'}</p>{t.currentTarget.visible&&<Link to={t.currentTarget.route} target="_blank" rel="noopener noreferrer">사용자 화면 확인 ↗</Link>}<details className="support-evidence"><summary>접수 시점과 비교할 현재 값</summary><pre>{JSON.stringify(t.currentTarget.snapshot,null,2)}</pre></details></section>}
 <details className="support-evidence"><summary>관리자 처리 이력 · {t.actions?.length??0}건</summary>{t.actions?.map((a,i)=><div key={i}><p>{a.createdAt} · {a.action} · 처리자 {a.actorId??'사용자 접수'}</p><pre>{JSON.stringify(a.details,null,2)}</pre></div>)}</details>
 </aside></div></section>
}
function TicketActions({ticket:t,saved}:{ticket:Ticket;saved:(t:Ticket)=>void}){
 const [note,setNote]=useState(''),[internal,setInternal]=useState(''),[duplicate,setDuplicate]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[mode,setMode]=useState('ASSIGN_SELF');const guard=useRef(false),clearDirty=useUnsaved(Boolean(note||internal||duplicate)&&!busy)
 const active=!['RESOLVED','CLOSED'].includes(t.status),catalog=t.target?.namespace==='CATALOG',canPublish=catalog&&!!t.currentTarget?.visible&&['EVENT','PARTICIPANT','PRODUCT'].includes(t.target!.type),canHide=catalog&&!!t.currentTarget?.visible&&['EVENT','PARTICIPANT','ASSET','FLOORPLAN'].includes(t.target!.type)
 const run=async(e:FormEvent)=>{e.preventDefault();if(guard.current)return;guard.current=true;setBusy(true);setError('');try{
  if(!note.trim())throw new Error('처리 사유·안내를 입력해 주세요.')
  if(['HIDE','PUBLISH','APPROVE','REJECT','REVOKE'].includes(mode)&&!window.confirm(mode==='PUBLISH'?'해당 행사에서 검토 완료된 정보가 함께 공개됩니다. 다른 변경도 확인했으며 신고 대상의 공개 변경을 확인하고 완료할까요?':mode==='HIDE'?'신고 대상의 공개를 중지하고 작성자에게 결과를 안내할까요?':'업체 관리 관계를 변경하고 결과를 안내할까요?'))return
  let result:Ticket;const body:ActionInput={revision:t.revision,action:mode,note,duplicateOf:duplicate||null,expectedFingerprint:t.currentTarget?.fingerprint??null}
  if(mode==='PUBLISH'){
   if(t.eventRevision===undefined||!t.currentTarget)throw new Error('현재 행사 검토 정보를 새로고침해 주세요.')
   result=await supportApi.publishReviewed(t.id,{revision:t.revision,expectedFingerprint:t.currentTarget.fingerprint,eventRevision:t.eventRevision,targetRevision:0,overrides:{},note:internal||note,reply:note})
  }else if(mode==='HIDE')result=await supportApi.hide(t.id,body)
  else if(mode==='APPROVE'||mode==='REJECT')result=await supportApi.decideClaim(t.id,{revision:t.revision,decision:mode,note:internal||note,reply:note})
  else if(mode==='REVOKE'){
   if(t.exhibitorId==null||t.requesterId==null||!t.management)throw new Error('관리 관계를 다시 확인해 주세요.')
   await supportApi.revoke(t.exhibitorId,t.requesterId,t.management.revision,note);result=await supportApi.detail(t.id,true)
  }else result=await supportApi.action(t.id,body)
  clearDirty();setNote('');setInternal('');setDuplicate('');setMode('ASSIGN_SELF');saved(result)
 }catch(e){setError(e instanceof Error?e.message:'처리 실패')}finally{guard.current=false;setBusy(false)}}
 return <form className="panel support-form" onSubmit={e=>void run(e)}><h2>{t.kind==='CLAIM'?'업체 관리권 심사':'접수 처리'}</h2>
 {t.kind==='REPORT'&&<><p className="support-note">답변만 작성했다고 정보 정정이 완료되는 것은 아닙니다. 실제 공개 결과를 확인한 뒤 처리하세요.</p>{catalog&&<Link className="btn secondary" to={`/admin/subculture?event=${t.target!.eventId}`} target="_blank" rel="noopener noreferrer">수집 정보·이미지·배치도 검토 ↗</Link>}{!catalog&&t.target&&<p>운영 행사·상품은 기존 운영 화면에서 해당 소유권 범위에 따라 수정한 후 공개 변경을 확인합니다. 관리자라는 이유로 업체 API 소유권을 우회하지 않습니다.</p>}</>}
 {t.contentComparisonAvailable===false&&<p className="form-alert" role="status">이전 방식으로 접수된 배치도 신고여서 당시 좌표 비교 근거가 충분하지 않습니다. 원문·버전을 직접 확인해 사유를 남겨 처리해 주세요. 공개 시각만 바뀐 것을 정정 근거로 사용하지 않습니다. 실제 공개 중지 여부는 확인할 수 있습니다.</p>}
 {t.kind==='CLAIM'&&<p className="support-claim-warning">공식 운영·위임 근거를 직접 확인하세요. 승인해도 해당 업체 정정 요청의 관계만 부여됩니다. 공동 부스·행사·예약·POS 편집권은 부여하지 않습니다. 본인 신청은 다른 관리자가 심사합니다.</p>}
 <label className="field"><span>처리 동작</span><select className="select" value={mode} disabled={busy} onChange={e=>setMode(e.target.value)}><option value="ASSIGN_SELF">내가 담당</option>{active&&<><option value="START">확인 중으로 변경</option><option value="WAIT">추가 정보 요청</option></>}{t.kind==='INQUIRY'&&t.status==='ANSWERED'&&<option value="CLOSE">답변 후 종료</option>}{!active&&t.kind!=='CLAIM'&&<option value="REOPEN">다시 열기</option>}{t.kind==='REPORT'&&active&&<><option value="VERIFY_CHANGED" disabled={t.currentTarget?.visible&&t.contentComparisonAvailable===false}>현재 공개 변경 확인 후 완료</option>{canPublish&&<option value="PUBLISH">검토된 정보 공개·변경 확인 후 완료</option>}{canHide&&<option value="HIDE">대상 공개 중지 후 완료</option>}<option value="NO_CHANGE">확인 후 정보 유지</option><option value="DUPLICATE">기존 신고에 연결</option><option value="OTHER">기타 사유로 종료</option></>}{t.kind==='CLAIM'&&active&&<><option value="APPROVE">관리 관계 승인</option><option value="REJECT">반려</option></>}{t.kind==='CLAIM'&&t.management?.state==='ACTIVE'&&<option value="REVOKE">관리 관계 회수</option>}</select></label>
 {mode==='DUPLICATE'&&<label className="field"><span>원신고 전체 ID (관리자 상세 주소의 UUID)</span><input className="input" required value={duplicate} onChange={e=>setDuplicate(e.target.value)} disabled={busy}/><small>원신고의 작성자·내용은 이 신고 작성자에게 공개하지 않습니다.</small></label>}
 <label className="field"><span>{['ASSIGN_SELF','START','REOPEN'].includes(mode)?'처리 사유 (내부 이력)':'작성자에게 보낼 처리 사유·결과'}</span><textarea className="textarea" required rows={4} maxLength={2000} value={note} onChange={e=>setNote(e.target.value)} disabled={busy}/></label>
 {['PUBLISH','APPROVE','REJECT'].includes(mode)&&<label className="field"><span>내부 확인 근거·메모 (선택)</span><textarea className="textarea" rows={3} maxLength={2000} value={internal} onChange={e=>setInternal(e.target.value)} disabled={busy}/></label>}
 {mode==='VERIFY_CHANGED'&&<p className="support-note">변경된 내용이 신고를 해결했는지 운영자가 직접 확인해야 합니다. 서버는 접수 시점과 비교해 실제 공개 변경 여부를 검사합니다.</p>}
 {error&&<p className="form-alert" role="alert">{error}</p>}<button className="btn primary" disabled={busy}>{busy?'처리 중…':'처리 저장'}</button><small>화면이 오래 열려 있으면 충돌로 저장되지 않습니다. 새로고침 후 확인해 주세요.</small></form>
}
