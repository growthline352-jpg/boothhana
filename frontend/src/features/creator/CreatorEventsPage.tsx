import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { creatorApi } from '../../api'
import { useRemote } from '../../app/useRemote'
import { PageHeader } from '../../components/layout/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States'
import { StatusChip } from '../../components/ui/StatusChip'
import type { EventSummary } from '../../types'

function eventState(event: EventSummary) {
  if (event.status === 'ENDED') return { label: '종료', tone: 'muted' as const, button: '등록 종료' }
  if (event.applicationStatus === 'PENDING') return { label: '이전 신청 대기', tone: 'warning' as const, button: '신청 완료' }
  if (event.applicationStatus === 'APPROVED') return { label: '등록 완료', tone: 'active' as const, button: '등록 완료' }
  if (event.applicationStatus === 'WITHDRAWN') return { label:'신청 철회',tone:'muted' as const,button:'내역에서 재신청' }
  if (event.applicationStatus === 'REJECTED') return { label: '반려', tone: 'danger' as const, button: '반려됨' }
  return { label: event.status === 'PUBLISHED' ? '등록 가능' : '준비중', tone: 'muted' as const, button: '부스 등록' }
}
export function CreatorEventsPage() {
  const applications=useRemote("features/creator/CreatorEventsPage:CreatorEventsPage:applications", creatorApi.applications,[])
  const booths = useRemote("features/creator/CreatorEventsPage:CreatorEventsPage:booths", creatorApi.booths, [])
  const [chosen, setChosen] = useState('')
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState<number | null>(null)
  const submitting = useRef(false)
  const selected = booths.data?.some(booth => String(booth.id) === chosen) ? chosen
    : booths.data?.length === 1 ? String(booths.data[0].id) : ''
  const events = useRemote("features/creator/CreatorEventsPage:CreatorEventsPage:events", () => selected ? creatorApi.events(Number(selected)) : Promise.resolve([]), [selected])

  const apply = async (eventId: number) => {
    if (!selected || submitting.current) return
    submitting.current = true
    setPending(eventId)
    setMessage('')
    try {
      await creatorApi.apply(eventId, Number(selected))
      await events.reload();await applications.reload()
      setMessage('부스를 등록했습니다. 바로 상품과 소개를 관리할 수 있습니다.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '부스를 등록하지 못했습니다.')
    } finally {
      submitting.current = false
      setPending(null)
    }
  }
  const change=async(id:number,revision:number,type:'resubmit'|'withdraw')=>{
    if(submitting.current)return
    if(!window.confirm(type==='resubmit'?'같은 부스로 등록하고 공개할까요?':'대기 중인 신청을 철회할까요?'))return
    submitting.current=true;setPending(id);setMessage('')
    try{await creatorApi[type](id,revision);await events.reload();await applications.reload();setMessage(type==='resubmit'?'부스를 등록하고 공개했습니다.':'신청을 철회했습니다.')}
    catch(e){setMessage(e instanceof Error?e.message:'신청 변경 실패')}
    finally{submitting.current=false;setPending(null)}
  }
  return <>
    <PageHeader eyebrow="Creator · Events" title="예약·판매 행사 등록" description="부스를 등록하면 바로 운영할 수 있습니다. 계정당 행사별 1개만 등록할 수 있습니다." />
    <p><Link className="btn secondary" to="/creator/catalog/events">공개 행사 찾아 부스 등록하기</Link></p>
    {message && <div className="notice-banner" role="status">{message}</div>}
    {applications.error&&<ErrorState error={applications.error} retry={()=>void applications.reload()}/>}
    {!!applications.data?.length&&<section className="panel"><h2>내 계정의 등록 내역</h2>{applications.data.map(a=><article className="support-ticket-row" key={a.id}><div><h3>{a.eventName} · {a.boothName}</h3><p>{a.status==='REJECTED'?'반려':a.status==='WITHDRAWN'?'철회':a.status==='APPROVED'?'등록 완료':'대기'}</p>{a.reason&&<p className="form-alert">반려 사유: {a.reason}</p>}</div><div className="row-actions">{['REJECTED','WITHDRAWN','PENDING'].includes(a.status)&&<button className="btn secondary" disabled={pending!==null||events.data?.find(e=>e.id===a.eventId)?.status!=='PUBLISHED'} onClick={()=>void change(a.id,a.revision,'resubmit')}>등록하고 공개</button>}{a.status==='PENDING'&&<button className="btn subtle" disabled={pending!==null} onClick={()=>void change(a.id,a.revision,'withdraw')}>신청 철회</button>}</div></article>)}</section>}

    {booths.loading ? <LoadingState label="내 부스를 불러오고 있습니다" />
      : booths.error ? <ErrorState error={booths.error} retry={() => void booths.reload()} />
      : !booths.data?.length ? <EmptyState title="먼저 기본 부스를 만들어 주세요" description="기본 부스를 만든 뒤 행사에 바로 등록할 수 있습니다."
          action={<Link className="btn primary" to="/creator/booths">부스 만들기</Link>} />
      : <>
        <label className="field"><span>참가할 기본 부스</span>
          <select className="select" value={selected} disabled={pending !== null} onChange={event => { setChosen(event.target.value); setMessage('') }}>
            <option value="">부스를 선택해 주세요</option>
            {booths.data.map(booth => <option key={booth.id} value={booth.id}>{booth.name}</option>)}
          </select>
        </label>
        {!selected ? <EmptyState title="참가할 부스를 선택해 주세요" description="기본 부스는 여러 개 만들 수 있지만 행사에는 계정당 1개만 등록할 수 있습니다." />
          : events.loading ? <LoadingState label="행사를 불러오고 있습니다" />
          : events.error ? <ErrorState error={events.error} retry={() => void events.reload()} />
          : !events.data?.length ? <EmptyState title="표시할 행사가 없습니다" description="현재 등록 가능한 예약·판매 행사가 없습니다. 위의 ‘공개 행사 찾아 부스 등록하기’에서 참가할 공개 행사를 찾아보세요." />
          : <div className="console-list">{events.data.map(event => {
            const account=applications.data?.find(a=>a.eventId===event.id&&['PENDING','APPROVED'].includes(a.status))
            const state = eventState({...event,applicationStatus:account?.status??event.applicationStatus})
            return <article className="list-row" key={event.id}><div>
              <StatusChip tone={state.tone}>{state.label}</StatusChip><h2>{event.name}</h2>
              <p className="item-meta">{event.venue} · {new Date(event.startAt).toLocaleDateString('ko-KR')} — {new Date(event.endAt).toLocaleDateString('ko-KR')}</p>
            </div><button className="btn primary" disabled={pending !== null || event.status !== 'PUBLISHED' || applications.loading || Boolean(applications.error) || Boolean(account) || Boolean(event.applicationStatus)}
              onClick={() => void apply(event.id)}>{pending === event.id ? '등록 중…' : state.button}</button></article>
          })}</div>}
      </>}
  </>
}
