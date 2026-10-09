import { useRef,useState,type FormEvent } from 'react'
import { Navigate,Link,useLocation,useNavigate,useParams,useSearchParams } from 'react-router'
import { useAuth } from '../../app/useAuth'
import { useRemote } from '../../app/useRemote'
import { useUnsaved } from './useSupportUnsaved'
import { ErrorState,LoadingState,EmptyState } from '../../components/ui/States'
import { PageHeader } from '../../components/layout/PageHeader'
import { Pager } from '../catalog/Shared'
import { supportApi,type TicketInput,type TicketKind } from './api'
import { categories,kinds,statuses,resolutions,parseKind,readTarget,evidenceLines,safeReturnPath,outcomeTone,supportPath,supportTemplate } from './rules'
import { Attachments,MessageThread,ReplyForm,TicketContext,TicketHeader } from './TicketViews'
import { TicketSubmission,attemptStorage,attemptKey } from './submission'
import './support.css'

export function SupportHome(){
 const [params,setParams]=useSearchParams(),{user,loading,loginUrl}=useAuth();const kind=parseKind(params.get('kind')),page=Math.max(0,Math.min(100000,Number(params.get('page'))||0))
 const list=useRemote("features/support/SupportPages:SupportHome:list", ()=>user?supportApi.list(kind,page):Promise.resolve(null),[user?.id,kind,page])
 return <section className="content-wrap section-pad support-page"><PageHeader eyebrow="고객지원" title="고객센터" description="잘못된 정보와 이용 중 불편한 점을 알려주세요. 답변은 이곳에서 확인할 수 있어요."/><div className="support-entry-grid"><Link to="/support/new?category=EVENT_REQUEST" className="panel"><h2>행사 추가 요청</h2><p>찾는 행사가 없나요? 행사명·일정·장소·공식 링크를 알려주세요.</p><span>행사 등록 요청 →</span></Link><Link to="/support/new" className="panel"><h2>문의하기</h2><p>로그인·서비스·예약·업체 관리 문의</p><span>문의 작성 →</span></Link><Link to="/discover" className="panel"><h2>정보 오류 신고</h2><p>행사·부스·상품·배치도의 ‘신고’에서 접수하면 대상이 자동 연결돼요.</p><span>행사에서 찾기 →</span></Link><Link to="/support/guest" className="panel"><h2>로그인이 안 되나요?</h2><p>비회원 로그인 장애 접수 및 비밀 조회키로 답변 확인</p><span>비회원 문의 →</span></Link></div><nav className="support-tabs" aria-label="내 접수 내역">{(['INQUIRY','REPORT','CLAIM'] as TicketKind[]).map(k=><button key={k} className={kind===k?'active':''} aria-pressed={kind===k} onClick={()=>setParams({kind:k})}>{k==='INQUIRY'?'내 문의':k==='REPORT'?'내 신고':'관리권 신청'}</button>)}</nav>{loading?<LoadingState/>:!user?<EmptyState title="로그인하면 내 접수 내역을 볼 수 있어요" description="같은 계정으로 작성한 문의·신고를 확인합니다." action={<a href={loginUrl} className="btn primary">카카오 로그인</a>}/>:list.loading?<LoadingState/>:list.error?<ErrorState error={list.error} retry={()=>void list.reload()}/>:!list.data?.items.length?<EmptyState title="아직 접수한 내역이 없어요" description="작성한 문의·신고·관리권 요청과 처리 결과가 여기에 표시됩니다."/>:<><div className="support-ticket-list">{list.data.items.map(t=><Link className="panel support-ticket-row" to={`/support/tickets/${t.id}`} key={t.id}><div><small>{t.number} · {categories[t.kind][t.category]}</small><h3>{t.title}</h3>{t.resolution&&<small>{resolutions[t.resolution]??t.resolution}</small>}</div><span className={`chip ${outcomeTone(t.status)}`}>{statuses[t.status]}</span></Link>)}</div><Pager page={page} total={list.data.total} change={p=>setParams({kind,page:String(p)})}/></>}</section>
}
export function SupportNew(){const location=useLocation();return <SupportNewForm key={location.search}/>}
function SupportNewForm(){
 const [params]=useSearchParams(),location=useLocation(),navigate=useNavigate(),{user,loading,loginUrl}=useAuth();const kind=parseKind(params.get('kind')),target=readTarget(params)
 const key=JSON.stringify(target),resolved=useRemote("features/support/SupportPages:SupportNewForm:resolved", ()=>target?supportApi.target(target):Promise.resolve(null),[key,user?.id]);const claimables=useRemote("features/support/SupportPages:SupportNewForm:claimables", ()=>kind==='CLAIM'&&target?.type==='PARTICIPANT'?supportApi.claimables(target):Promise.resolve([]),[kind,key])
 const template=supportTemplate(params.get('template'))
 const productRequest=kind==='REPORT'&&target?.type==='PARTICIPANT'&&(params.get('template')==='NEW_PRODUCT'||params.get('template')==='PRODUCT_IMAGE')
 const [title,setTitle]=useState(template.title),[body,setBody]=useState(template.body),[category,setCategory]=useState(kind==='CLAIM'?(target?.type==='EVENT'?'ORGANIZER':'OWNERSHIP'):params.get('category')&&categories[kind][params.get('category')!]?params.get('category')!:Object.keys(categories[kind])[0]),[links,setLinks]=useState(''),[exhibitor,setExhibitor]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const guard=useRef(false),posted=useRef(false)
 const attemptRef=useRef<{key:string;value:TicketSubmission}|null>(null)
 const storageKey=attemptKey(user?.id,kind,key)
 if(!attemptRef.current||attemptRef.current.key!==storageKey)attemptRef.current={key:storageKey,value:new TicketSubmission(attemptStorage(),storageKey)}
 const attempt=attemptRef.current.value
 const [,refreshAttempt]=useState(0),[recoveryNote,setRecoveryNote]=useState('')
 const clearDirty=useUnsaved(Boolean(title||body||links||attempt.requestId)&&!busy&&!posted.current)
 const finish=(id:string)=>{attempt.completed();posted.current=true;clearDirty();setTitle('');setBody('');setLinks('');void navigate(`/support/tickets/${id}`,{replace:true})}
 const send=async(e:FormEvent)=>{
  e.preventDefault();if(guard.current||attempt.uncertain)return
  guard.current=true;setBusy(true);setError('');setRecoveryNote('')
  let dispatched=false
  try{
   if(kind!=='INQUIRY'&&!resolved.data)throw new Error('대상을 먼저 확인해 주세요.')
   const context:Record<string,string>={pagePath:safeReturnPath((location.state as {supportFrom?:string}|null)?.supportFrom??resolved.data?.route??'/support')}
   if(params.get('seen'))context.viewedVersion=params.get('seen')!.slice(0,1000)
   if(params.get('errorCode'))context.errorCode=params.get('errorCode')!.slice(0,1000)
   const data:Omit<TicketInput,'requestId'>={kind,category,title,body,evidence:evidenceLines(links),target:resolved.data?.target??null,context,exhibitorId:kind==='CLAIM'&&category!=='ORGANIZER'?Number(exhibitor)||null:null}
   const payload=attempt.prepare(data);dispatched=true
   const saved=await supportApi.create(payload);finish(saved.id)
  }catch(caught){if(dispatched)attempt.failed(caught);setError(caught instanceof Error?caught.message:'접수 결과를 확인하지 못했어요.')}
  finally{guard.current=false;setBusy(false);refreshAttempt(x=>x+1)}
 }
 const recover=async(retryOriginal=false)=>{
  if(guard.current||!attempt.requestId)return
  guard.current=true;setBusy(true);setError('');setRecoveryNote('')
  try{
   const receipt=await supportApi.receipt(attempt.requestId)
   if(receipt.found){if(receipt.id!==attempt.requestId)throw new Error('접수 확인 응답이 일치하지 않습니다. 내 접수 내역을 확인해 주세요.');finish(receipt.id);return}
   if(retryOriginal&&attempt.payload){const saved=await supportApi.create(attempt.payload);finish(saved.id);return}
   attempt.missing();setRecoveryNote('아직 확인되는 접수 내역이 없습니다. 내용을 확인해 같은 요청번호로 다시 보낼 수 있어요. 먼저 보낸 요청이 뒤늦게 저장되더라도 새 접수를 자동으로 만들지 않습니다.')
  }catch(caught){attempt.uncertain=true;setError(caught instanceof Error?caught.message:'접수 결과를 확인하지 못했어요. 잠시 후 다시 확인해 주세요.')}
  finally{guard.current=false;setBusy(false);refreshAttempt(x=>x+1)}
 }
 if(loading)return <LoadingState/>
 if(!user)return <section className="content-wrap section-pad support-page"><EmptyState title="로그인 후 접수할 수 있어요" description="신고 대상은 로그인 후에도 유지됩니다. 문의 내용은 URL에 저장하지 않아요." action={<a href={loginUrl} className="btn primary">카카오 로그인</a>}/><Link to="/support/guest">로그인 장애 비회원 문의</Link></section>
 if(kind!=='INQUIRY'&&!target)return <section className="content-wrap section-pad support-page"><EmptyState title="신고할 대상을 선택해 주세요" description="행사·부스·상품 화면의 신고 버튼에서 시작해 주세요." action={<Link to="/discover">행사 둘러보기</Link>}/></section>
 return <section className="content-wrap section-pad support-page support-narrow"><PageHeader eyebrow="고객지원" title={category==='EVENT_REQUEST'?'행사 추가 요청':productRequest?template.title:kinds[kind]} description={category==='EVENT_REQUEST'?'아직 등록되지 않은 행사를 알려주세요. 확인 결과는 내 문의에서 볼 수 있어요.':productRequest?'아래 행사·부스에 반영할 내용을 적어주세요. 관리자가 확인한 뒤 처리 결과를 안내합니다.':kind==='CLAIM'?'공식 계정 소유·담당자 위임 근거를 관리자가 확인합니다. 링크만 제출했다고 자동 승인되지 않습니다. 한 회차·본인 업체 범위만 연결됩니다.':'무엇이 다른지 알려주세요. 접수만으로 정보가 자동 삭제되지는 않습니다.'}/>{resolved.loading?<LoadingState/>:resolved.error?<div><ErrorState error={resolved.error} retry={()=>void resolved.reload()}/><Link className="btn secondary" to="/support/new">대상 없이 일반 문의하기</Link></div>:resolved.data&&<div className="support-target"><strong>{resolved.data.label}</strong><p>{target?.day} {target?.hall} {target?.areaId}</p><Link to={resolved.data.route}>신고 대상 다시 보기 ↗</Link></div>}
 {attempt.uncertain&&<section className="panel support-recovery" role="status" aria-live="polite"><h2>먼저 보낸 접수 결과를 확인해 주세요</h2><p>응답이 도착하지 않았지만 접수는 완료됐을 수 있어요. 중복 접수를 막기 위해 입력을 잠시 보관했습니다. 접수됐다면 해당 내역에서 내용을 추가해 주세요.</p><div className="row-actions"><button className="btn primary" type="button" disabled={busy} onClick={()=>void recover()}>접수 여부 확인</button>{attempt.payload&&<button className="btn secondary" type="button" disabled={busy} onClick={()=>void recover(true)}>동일 내용 다시 전송</button>}<Link to={`/support?kind=${kind}`}>내 접수 내역 보기</Link></div>{!attempt.payload&&<p>새로고침 후에는 본문을 복원하지 않습니다. 요청번호만 보관되어 있어 접수 여부부터 확인합니다.</p>}</section>}
 {recoveryNote&&<p role="status" className="notice-banner">{recoveryNote}</p>}
 {error&&<p role="alert" className="form-alert">{error}</p>}
 {!attempt.storageAvailable&&<p className="form-alert">이 브라우저에서 요청번호 보관을 사용할 수 없습니다. 결과를 확인하기 전 이 탭을 닫거나 새로고침하지 마세요.</p>}
 <form className="panel support-form" onSubmit={e=>void send(e)}><fieldset disabled={busy||attempt.uncertain}>
 {kind==='CLAIM'&&target?.type==='PARTICIPANT'&&<><label className="field"><span>공식 운영 근거를 제출할 업체</span><select className="select" required value={exhibitor} onChange={e=>setExhibitor(e.target.value)}><option value="">업체를 선택해 주세요</option>{claimables.data?.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>{claimables.error&&<ErrorState error={claimables.error} retry={()=>void claimables.reload()}/>} {!claimables.loading&&!claimables.error&&!claimables.data?.length&&<p className="form-alert">연결을 확인할 업체 정보가 없습니다. <Link to={target?supportPath('REPORT',target):'/support/new'}>정보 오류 신고</Link>로 운영팀에 알려주세요.</p>}<p className="support-note">공식 SNS·홈페이지 등 직접 관리함을 확인할 근거를 적어주세요. 주민번호·비밀번호·신분증은 제출하지 마세요.</p></>}
 <label className="field"><span>분류</span><select className="select" disabled={kind==='CLAIM'} value={category} onChange={e=>setCategory(e.target.value)}>{Object.entries(categories[kind]).map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>
 {category==='EVENT_REQUEST'&&<p className="support-note">행사명, 개최일, 장소와 공식 홈페이지 또는 주최자 SNS 링크를 적어주세요. 운영팀이 확인 후 등록 여부를 답변합니다.</p>}<label className="field"><span>{category==='EVENT_REQUEST'?'행사명':category==='ORGANIZER'?'주최 단체명':'제목'}</span><input className="input" required maxLength={160} value={title} onChange={e=>setTitle(e.target.value)}/></label>
 <label className="field"><span>{category==='EVENT_REQUEST'?'행사 일정·장소·소개':kind==='CLAIM'?'담당자·단체와의 관계·공식 계정 소유 또는 위임 근거':'내용·원하는 정정 사항'}</span><textarea className="textarea" required rows={8} maxLength={10000} value={body} onChange={e=>setBody(e.target.value)} placeholder={category==='EVENT_REQUEST'?'개최일: \n장소: \n행사 소개: \n주최자:':'예: 10월 11일 1관 B1로 표시되지만, 공식 공지에는 Z1로 변경되어 있어요.'}/></label>
 <label className="field"><span>근거 링크 ({kind==='CLAIM'?'필수':'선택'}, 한 줄에 하나·최대 5개)</span><textarea className="textarea" required={kind==='CLAIM'} rows={3} value={links} onChange={e=>setLinks(e.target.value)}/></label>
 <p className="support-note">첨부 이미지는 접수 후 내역에서 추가할 수 있어요. 접수 내용은 작성자와 운영팀만 볼 수 있고, 업체에 자동 전달하지 않습니다. 답변은 ‘내 접수 내역’에서 확인해 주세요.</p>
 <div className="row-actions"><Link className="btn secondary" to="/support">취소</Link><button className="btn primary" disabled={busy||!!resolved.error||kind!=='INQUIRY'&&!resolved.data||kind==='CLAIM'&&category!=='ORGANIZER'&&!exhibitor}>{busy?'접수 중…':'접수하기'}</button></div></fieldset></form></section>
}
export function SupportDetail(){const {id=''}=useParams(),{user,loading,loginUrl}=useAuth(),state=useRemote("features/support/SupportPages:SupportDetail:state", ()=>user?supportApi.detail(id):Promise.resolve(null),[user?.id,id]),options=useRemote("features/support/SupportPages:SupportDetail:options", supportApi.options,[])
 if(loading||state.loading)return <LoadingState/>
 if(!user)return <EmptyState title="내 접수 내역은 로그인 후 확인해 주세요" description="작성한 계정으로 로그인해 주세요." action={<a href={loginUrl}>카카오 로그인</a>}/>
 if(state.error||!state.data)return <ErrorState error={state.error??new Error('접수 내역이 없습니다.')} retry={()=>void state.reload()}/>
 const ticket=state.data;return <section className="content-wrap section-pad support-page support-narrow"><Link to={`/support?kind=${ticket.kind}`}>← 내 접수 내역</Link><TicketHeader ticket={ticket}/><TicketContext ticket={ticket}/><MessageThread ticket={ticket}/><Attachments ticket={ticket} enabled={options.data?.attachmentsEnabled} reload={state.reload}/><ReplyForm key={ticket.id} ticket={ticket} onSend={async m=>{state.setData(await supportApi.reply(id,m))}}/></section>
}
export function ManagedExhibitors(){return <Navigate to="/support/management" replace/>}
