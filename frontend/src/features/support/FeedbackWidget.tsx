import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router'
import { useAuth } from '../../app/useAuth'
import { useRemote } from '../../app/useRemote'
import { supportApi, type TicketInput } from './api'
import { secureGuestKey } from './rules'
import { TicketSubmission } from './submission'
import './feedback.css'
import { acquireBodyScrollLock } from '../../components/ui/bodyScrollLock'
import { informationKinds, type InformationRequest } from './InformationRequestButton'

export function FeedbackWidget({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) {
  const auth = useAuth()
  const confirmedIdentity = auth.status === 'authenticated' ? `member:${auth.user?.id}` : auth.status === 'anonymous' ? 'anonymous' : null
  const [identity, setIdentity] = useState(confirmedIdentity ?? 'pending')
  if (confirmedIdentity !== null && confirmedIdentity !== identity) setIdentity(confirmedIdentity)
  return <>
    <button type="button" className="feedback-launcher" onClick={() => setOpen(true)}><span aria-hidden="true">＋</span> 이런 개선이 필요해요</button>
    <FeedbackDialog key={confirmedIdentity ?? identity} open={open} setOpen={setOpen}/>
  </>
}

export function FeedbackDialog({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) {
  const auth = useAuth(), location = useLocation()
  const dialog = useRef<HTMLDialogElement>(null), guard = useRef(false)
  const [attempt] = useState(() => new TicketSubmission(null, 'feedback'))
  const [accessKey] = useState(secureGuestKey)
  const [title, setTitle] = useState(''), [body, setBody] = useState(''), [website, setWebsite] = useState('')
  const [pagePath, setPagePath] = useState(location.pathname)
  const [request, setRequest] = useState<InformationRequest>({kind:'FEATURE'})
  const [draftNotice,setDraftNotice] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [uncertain, setUncertain] = useState(false)
  const [receipt, setReceipt] = useState<{ id: string; number: string } | null>(null)
  const options = useRemote("features/support/FeedbackWidget:FeedbackDialog:options", () => open && auth.status === 'anonymous' ? supportApi.options() : Promise.resolve(null), [open, auth.status])
  const settled = auth.status === 'authenticated' || auth.status === 'anonymous'
  const ready = auth.status === 'authenticated' || auth.status === 'anonymous' && options.data?.feedbackEnabled
  useEffect(()=>{
    const receive=(event:Event)=>{
      const detail=(event as CustomEvent<InformationRequest>).detail
      if(!detail || !Object.hasOwn(informationKinds,detail.kind))return
      if(attempt.requestId || title || body || busy) setDraftNotice('작성 중인 의견이 있어요. 먼저 이 의견을 보내거나 내용을 정리해 주세요.')
      else {setRequest(detail);setPagePath(location.pathname);setReceipt(null);setDraftNotice('')}
      setOpen(true)
    }
    window.addEventListener('boothana:information-request',receive)
    return()=>window.removeEventListener('boothana:information-request',receive)
  },[attempt,title,body,busy,location.pathname,setOpen])
  useEffect(() => { if (open && !attempt.requestId && !title && !body) setPagePath(location.pathname) }, [open, attempt, attempt.requestId, title, body, location.pathname])
  useEffect(() => {
    if (!open) return
    const element = dialog.current, focus = document.activeElement as HTMLElement | null
    const releaseScroll = acquireBodyScrollLock()
    if (element && !element.open) element.showModal()
    return () => { element?.close(); releaseScroll(); focus?.focus() }
  }, [open])
  const close = () => { if (!guard.current) { if (receipt) setReceipt(null); setOpen(false) } }
  const send = async (event: FormEvent) => {
    event.preventDefault()
    if (guard.current || !ready) return
    guard.current = true; setBusy(true); setError('')
    try {
      const context:Record<string,string>={pagePath}
      if(request.kind!=='FEATURE') {
        context.needType=request.kind
        if(request.eventId)context.eventId=String(request.eventId)
        if(request.day)context.day=request.day
        if(request.query?.trim())context.searchQuery=request.query.trim().slice(0,100)
      }
      const data: Omit<TicketInput, 'requestId'> = { kind: 'INQUIRY', category: 'FEATURE_REQUEST', title: title.trim(), body: body.trim(), evidence: [], target: null, context, exhibitorId: null }
      const payload = attempt.uncertain && attempt.payload ? attempt.payload : attempt.prepare(data)
      const saved = auth.status === 'authenticated' ? await supportApi.create(payload) : await supportApi.feedback(payload, accessKey, website)
      attempt.completed(); setUncertain(false); setReceipt({ id: saved.id, number: saved.number }); setTitle(''); setBody('');setRequest({kind:'FEATURE'});setDraftNotice('')
    } catch (caught) {
      if (attempt.payload) attempt.failed(caught)
      setUncertain(attempt.uncertain)
      setError(caught instanceof Error ? caught.message : '접수 결과를 확인하지 못했습니다.')
    } finally { guard.current = false; setBusy(false) }
  }
  return <dialog className="feedback-dialog" ref={dialog} aria-labelledby="feedback-heading" onCancel={event => { event.preventDefault(); close() }}>
    <div className="feedback-heading"><h2 id="feedback-heading">이런 개선이 필요해요</h2><button type="button" aria-label="개선 의견 닫기" disabled={busy} onClick={close}>×</button></div>
    {!settled && <p role="status">{auth.status === 'error' ? '로그인 상태를 확인하지 못했어요.' : '로그인 상태를 확인하고 있어요.'}{auth.status === 'error' && <button type="button" onClick={() => void auth.refresh()}>다시 확인</button>}</p>}
    <div hidden={!settled}>
    {receipt ? <div className="feedback-receipt" role="status"><span className="feedback-check" aria-hidden="true">✓</span><h3>의견을 보내주셔서 감사합니다</h3><p>접수번호 {receipt.number}</p><p>{auth.user ? '답변과 처리 상태는 내 문의에서 확인할 수 있어요.' : '보내주신 의견은 서비스 개선에 참고하겠습니다. 답변이 필요한 문의는 로그인 후 고객센터를 이용해 주세요.'}</p>{auth.user && <Link to={`/support/tickets/${receipt.id}`} onClick={close}>내 문의에서 확인하기 →</Link>}<button type="button" className="feedback-submit" onClick={() => { setReceipt(null); close() }}>확인</button></div>
      : <form onSubmit={event => void send(event)}>
        <p>어떤 점이 더 좋아지면 좋을까요?</p>
        {draftNotice&&<p role="status">{draftNotice}</p>}
        <label className="feedback-field">요청 종류<select value={request.kind} disabled={busy||uncertain} onChange={event=>setRequest({...request,kind:event.target.value as InformationRequest['kind']})}>{Object.entries(informationKinds).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
        {request.kind!=='FEATURE'&&<p className="feedback-note">{request.eventId&&`행사 #${request.eventId} · `}{request.day&&`${request.day} · `}{request.query&&`검색: ${request.query} · `}찾는 정보를 적어주시면 확인할게요.</p>}
        <label className="feedback-field">제목<input autoFocus required maxLength={160} value={title} disabled={busy || uncertain} onChange={event => setTitle(event.target.value)} placeholder="어떤 개선이 필요한지 알려주세요"/></label>
        <label className="feedback-field">내용<textarea required minLength={10} maxLength={10000} rows={5} value={body} disabled={busy || uncertain} onChange={event => setBody(event.target.value)} placeholder="불편했던 점이나 원하는 기능을 적어주세요. (10자 이상)"/></label>
        <label className="feedback-honeypot" aria-hidden="true">웹사이트<input tabIndex={-1} autoComplete="off" value={website} onChange={event => setWebsite(event.target.value)}/></label>
        <p className="feedback-note">{auth.user ? '내 문의에서 답변과 처리 상태를 확인할 수 있어요.' : '로그인 없이 보낼 수 있어요. 비회원 의견에는 개별 답변이 제공되지 않습니다.'}</p>
        {auth.status === 'anonymous' && options.loading && <p role="status">접수 가능 여부를 확인하고 있어요.</p>}
        {auth.status === 'anonymous' && (options.error || options.data && !options.data.feedbackEnabled) && <p role="alert">지금은 비회원 접수를 이용할 수 없어요. <button type="button" onClick={() => void options.reload()}>다시 확인</button></p>}
        {error && <p className="feedback-error" role="alert">{error}</p>}
        {uncertain && <p className="feedback-note">전송 결과가 불확실합니다. 같은 접수번호로 다시 확인하면 중복 접수를 방지할 수 있어요. 이 창에서 다시 확인해 주세요.</p>}
        <button className="feedback-submit" type="submit" disabled={busy || !ready || !title.trim() || body.trim().length < 10}>{busy ? '보내는 중…' : uncertain ? '접수 결과 다시 확인' : '개선 의견 보내기'}</button>
      </form>}
    </div>
  </dialog>
}
