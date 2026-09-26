import {useLayoutEffect,useRef,useState,type FormEvent} from 'react'
import {RemoteScope} from '../../app/RemoteScope'
import {Link} from 'react-router'
import {useRemote} from '../../app/useRemote'
import {PageHeader} from '../../components/layout/PageHeader'
import {LoadingState,ErrorState,EmptyState} from '../../components/ui/States'
import {supportApi,type GuestAccess,type Ticket,type TicketInput} from './api'
import {secureGuestKey,validGuest} from './rules'
import {TicketHeader,MessageThread,ReplyForm} from './TicketViews'
import {useUnsaved} from './useSupportUnsaved'
/** Secret is kept only in this tab's memory. Never URL, localStorage or analytics. */
export function GuestSupportPage(){
 const options=useRemote(supportApi.options,[]),[mode,setMode]=useState<'new'|'read'>('new'),[title,setTitle]=useState(''),[body,setBody]=useState(''),[website,setWebsite]=useState(''),[ticketId,setTicketId]=useState(''),[accessKey,setAccessKey]=useState(''),[confirmed,setConfirmed]=useState(false),[ticket,setTicket]=useState<Ticket|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');const ref=useRef<GuestAccess|null>(null),guard=useRef(false),sent=useRef(false),requestSignature=useRef('');const clear=useUnsaved(Boolean(title||body)&&!busy&&!sent.current)
 // A lookup is a separate session even when the same ticket/key is reopened.
 const scope=useRef(new RemoteScope()),activeToken=useRef<number|null>(null)
 useLayoutEffect(()=>{scope.current.activate();return()=>{scope.current.deactivate();ref.current=null;activeToken.current=null}},[])
 const invalidate=()=>{scope.current.begin();activeToken.current=null;ref.current=null}
 const endLookup=()=>{invalidate();guard.current=false;setBusy(false);setTicket(null);setAccessKey('');setTicketId('');requestSignature.current='';sent.current=false;setMode('read');setConfirmed(false);setError('')}
 const access=()=>({ticketId,accessKey})
 const generate=()=>{invalidate();sent.current=false;requestSignature.current='';const a={ticketId:crypto.randomUUID(),accessKey:secureGuestKey()};ref.current=a;setTicketId(a.ticketId);setAccessKey(a.accessKey);setConfirmed(false)}
 const resetRequest=()=>{if(!window.confirm('먼저 이전 접수 ID·조회키로 접수 여부를 확인해 주세요. 새 접수를 준비하면 이전 키는 이 화면에서 지워지며, 기존 접수는 삭제되지 않습니다. 계속할까요?'))return;invalidate();requestSignature.current='';sent.current=false;setTicketId('');setAccessKey('');setConfirmed(false);setError('');setMode('new')}
 const saveKey=()=>{const a=access();if(!validGuest(a))return;const blob=new Blob([`부스하나 비회원 문의 조회키\n접수 ID: ${a.ticketId}\n비밀 조회키: ${a.accessKey}\n조회 화면: ${window.location.origin}/support/guest\n유효기간: 접수 후 30일\n이 파일을 공개·공유하면 접수 내용과 답변을 타인이 볼 수 있습니다.\n`],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='boothhana-private-inquiry-key.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 const submit=async(e:FormEvent)=>{e.preventDefault();if(guard.current)return;const requestToken=scope.current.begin();if(requestToken===null)return;const requestAccess=access(),requestMode=mode;const active=()=>scope.current.accepts(requestToken);guard.current=true;setBusy(true);setError('');try{
  if(!validGuest(requestAccess))throw new Error('접수 ID와 비밀 조회키를 확인해 주세요.')
  let value:Ticket
  if(requestMode==='read')value=await supportApi.guestRead(requestAccess)
  else{if(!confirmed)throw new Error('비밀 조회키를 안전한 곳에 저장한 뒤 확인해 주세요.');const input:TicketInput={requestId:ticketId,kind:'INQUIRY',category:'ACCOUNT',title,body,evidence:[],target:null,context:{},exhibitorId:null};const signature=JSON.stringify(input);if(requestSignature.current&&requestSignature.current!==signature)throw new Error('이미 전송을 시도한 내용입니다. 먼저 답변 조회로 접수 여부를 확인해 주세요. 수정은 접수 후 추가 내용으로 보내주세요.');requestSignature.current=signature;value=await supportApi.guestCreate(input,requestAccess.accessKey,website)}
  if(!active())return;ref.current=requestAccess;activeToken.current=requestToken;sent.current=true;clear();setTitle('');setBody('');setTicket(value)
 }catch(e){if(active())setError(e instanceof Error?e.message:'처리 실패')}finally{if(active()){guard.current=false;setBusy(false)}}}
 const viewedAccess=ref.current,viewedToken=activeToken.current
 const sameLookup=()=>viewedToken!==null&&scope.current.accepts(viewedToken)&&viewedAccess!==null&&ref.current===viewedAccess
 if(options.loading)return <LoadingState/>
 if(options.error)return <ErrorState error={options.error} retry={()=>void options.reload()}/>
 if(!options.data?.guestEnabled)return <section className="content-wrap section-pad support-page"><EmptyState title="비회원 문의를 준비하고 있어요" description="현재 비회원 로그인 장애 접수가 활성화되지 않았습니다. 운영자가 배포 점검 후 제공해야 합니다." action={<Link to="/support">고객센터</Link>}/></section>
 return <section className="content-wrap section-pad support-page support-narrow"><PageHeader eyebrow="고객지원" title="로그인 장애 · 비회원 문의" description="이메일 인증이나 기존 예약 소유권 확인 기능이 아닙니다. 답변은 접수 ID와 비밀 조회키로 직접 확인합니다."/>
 {ticket?<><div className="support-guest-session"><p>이 화면을 닫으면 조회키를 다시 입력해야 합니다. 접수 후 30일까지만 조회할 수 있어요.</p><button className="btn secondary" onClick={saveKey}>비밀 조회키 보관</button></div><TicketHeader ticket={ticket}/><MessageThread ticket={ticket}/><ReplyForm key={ticket.id} ticket={ticket} onSend={async m=>{
   if(!sameLookup())throw new Error('조회가 종료되었거나 다른 접수로 바뀌었습니다. 접수 ID와 조회키를 다시 확인해 주세요.')
   const result=await supportApi.guestReply({...viewedAccess!},m)
   if(!sameLookup())throw new Error('조회가 종료되어 이전 답변 결과를 표시하지 않습니다. 이미 보낸 내용은 기존 접수에서 확인해 주세요.')
   setTicket(result)
  }}/><button className="btn secondary" onClick={endLookup}>조회 종료·키 지우기</button></>:<><div className="support-tabs"><button className={mode==='new'?'active':''} disabled={busy} onClick={()=>setMode('new')}>로그인 장애 접수</button><button className={mode==='read'?'active':''} disabled={busy} onClick={()=>setMode('read')}>답변 조회</button></div><form onSubmit={e=>void submit(e)} className="panel support-form"><fieldset disabled={busy}>
 {mode==='new'&&<><label className="field"><span>제목</span><input className="input" required maxLength={160} value={title} onChange={e=>setTitle(e.target.value)}/></label><label className="field"><span>로그인 문제 설명</span><textarea className="textarea" required maxLength={10000} rows={7} value={body} onChange={e=>setBody(e.target.value)}/></label><label className="support-honeypot" aria-hidden="true">웹사이트<input tabIndex={-1} autoComplete="off" value={website} onChange={e=>setWebsite(e.target.value)}/></label><p className="support-note">비밀번호·신분증·결제정보는 입력하지 마세요. 첨부와 자동 이메일 발송은 지원하지 않습니다.</p>{!ticketId&&<button type="button" className="btn secondary" onClick={generate}>비밀 조회키 만들기</button>}</>}
 {(mode==='read'||ticketId)&&<div className={mode==='new'?'support-secret':''}><label className="field"><span>접수 전체 ID</span><input className="input" required autoComplete="off" value={ticketId} readOnly={mode==='new'} onChange={e=>setTicketId(e.target.value.trim())}/></label><label className="field"><span>비밀 조회키 — 다른 사람에게 전달하지 마세요</span><input className="input" type="password" required autoComplete="off" value={accessKey} readOnly={mode==='new'} onChange={e=>setAccessKey(e.target.value.trim())}/></label>{mode==='new'&&<><button type="button" className="btn secondary" onClick={saveKey}>접수 ID·조회키 파일 저장</button><label className="check-field"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> 조회키를 안전한 곳에 보관했습니다.</label><small>키를 분실하면 계정·이메일로 복구할 수 없습니다. 키 생성 자체가 접수 완료는 아닙니다.</small></>}</div>}
 {error&&<div className="form-alert" role="alert"><p>{error}</p>{requestSignature.current&&<button type="button" className="btn secondary" onClick={resetRequest}>기존 접수 확인 후 새 접수 준비</button>}</div>}<button className="btn primary" disabled={busy||mode==='new'&&(!ticketId||!confirmed)}>{busy?'확인 중…':mode==='new'?'로그인 장애 접수':'내 답변 조회'}</button></fieldset></form></>}
 </section>
}
