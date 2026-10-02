import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { creatorApi } from '../../api'
import { useRemote } from '../../app/useRemote'
import { PageHeader } from '../../components/layout/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States'
import { StatusChip } from '../../components/ui/StatusChip'
import type { EventSummary } from '../../types'

function eventState(event: EventSummary) {
  if (event.status === 'ENDED') return { label: '종료', tone: 'muted' as const, button: '신청 종료' }
  if (event.applicationStatus === 'PENDING') return { label: '승인 대기', tone: 'warning' as const, button: '신청 완료' }
  if (event.applicationStatus === 'APPROVED') return { label: '승인 완료', tone: 'active' as const, button: '승인 완료' }
  if (event.applicationStatus === 'WITHDRAWN') return { label:'신청 철회',tone:'muted' as const,button:'내역에서 재신청' }
  if (event.applicationStatus === 'REJECTED') return { label: '반려', tone: 'danger' as const, button: '반려됨' }
  return { label: event.status === 'PUBLISHED' ? '신청 가능' : '준비중', tone: 'muted' as const, button: '참가 신청' }
}
export function CreatorEventsPage() {
  const applications=useRemote(creatorApi.applications,[])
  const booths = useRemote(creatorApi.booths, [])
  const [chosen, setChosen] = useState('')
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState<number | null>(null)
  const submitting = useRef(false)
  const selected = booths.data?.some(booth => String(booth.id) === chosen) ? chosen
    : booths.data?.length === 1 ? String(booths.data[0].id) : ''
  const events = useRemote(() => selected ? creatorApi.events(Number(selected)) : Promise.resolve([]), [selected])

  const apply = async (eventId: number) => {
    if (!selected || submitting.current) return
    submitting.current = true
    setPending(eventId)
    setMessage('')
    try {
      await creatorApi.apply(eventId, Number(selected))
      await events.reload();await applications.reload()
      setMessage('선택한 부스의 참가 신청을 저장했습니다.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '참가 신청을 저장하지 못했습니다.')
    } finally {
      submitting.current = false
      setPending(null)
    }
  }
  const change=async(id:number,revision:number,type:'resubmit'|'withdraw')=>{
    if(submitting.current)return
    if(!window.confirm(type==='resubmit'?'보완 후 같은 부스로 다시 신청할까요?':'대기 중인 신청을 철회할까요?'))return
    submitting.current=true;setPending(id);setMessage('')
    try{await creatorApi[type](id,revision);await events.reload();await applications.reload();setMessage(type==='resubmit'?'재신청을 저장했습니다.':'신청을 철회했습니다.')}
    catch(e){setMessage(e instanceof Error?e.message:'신청 변경 실패')}
    finally{submitting.current=false;setPending(null)}
  }
  return <>
    <PageHeader eyebrow="Creator · Events" title="참가신청 행사" description="부스하나에서 참가신청을 받는 행사입니다. 공개 행사·부스 안내는 내 공개 행사·부스 관리에서 수정하세요." />
    {message && <div className="notice-banner" role="status">{message}</div>}
    {applications.error&&<ErrorState error={applications.error} retry={()=>void applications.reload()}/>}
    {!!selected&&!!applications.data?.filter(a=>a.boothId===Number(selected)).length&&<section className="panel"><h2>선택 부스의 신청 내역</h2>{applications.data.filter(a=>a.boothId===Number(selected)).map(a=><article className="support-ticket-row" key={a.id}><div><h3>{a.eventName}</h3><p>{a.status==='REJECTED'?'반려':a.status==='WITHDRAWN'?'철회':a.status==='APPROVED'?'승인':'대기'}</p>{a.reason&&<p className="form-alert">반려 사유: {a.reason}</p>}</div><div className="row-actions">{['REJECTED','WITHDRAWN'].includes(a.status)&&<button className="btn secondary" disabled={pending!==null||events.data?.find(e=>e.id===a.eventId)?.status!=='PUBLISHED'} onClick={()=>void change(a.id,a.revision,'resubmit')}>보완 후 재신청</button>}{a.status==='PENDING'&&<button className="btn subtle" disabled={pending!==null} onClick={()=>void change(a.id,a.revision,'withdraw')}>신청 철회</button>}</div></article>)}</section>}

    {booths.loading ? <LoadingState label="내 부스를 불러오고 있습니다" />
      : booths.error ? <ErrorState error={booths.error} retry={() => void booths.reload()} />
      : !booths.data?.length ? <EmptyState title="먼저 기본 부스를 만들어 주세요" description="부스를 등록하면 행사 참가를 신청할 수 있습니다."
          action={<Link className="btn primary" to="/creator/booths">부스 만들기</Link>} />
      : <>
        <label className="field"><span>참가할 기본 부스</span>
          <select className="select" value={selected} disabled={pending !== null} onChange={event => { setChosen(event.target.value); setMessage('') }}>
            <option value="">부스를 선택해 주세요</option>
            {booths.data.map(booth => <option key={booth.id} value={booth.id}>{booth.name}</option>)}
          </select>
        </label>
        {!selected ? <EmptyState title="참가할 부스를 선택해 주세요" description="선택한 부스를 기준으로 행사별 신청 상태를 표시합니다." />
          : events.loading ? <LoadingState label="행사를 불러오고 있습니다" />
          : events.error ? <ErrorState error={events.error} retry={() => void events.reload()} />
          : !events.data?.length ? <EmptyState title="표시할 행사가 없습니다" description="현재 참가신청을 받는 행사가 없습니다. 공개 행사 정보는 행사 둘러보기에서 확인할 수 있습니다." />
          : <div className="console-list">{events.data.map(event => {
            const state = eventState(event)
            return <article className="list-row" key={event.id}><div>
              <StatusChip tone={state.tone}>{state.label}</StatusChip><h2>{event.name}</h2>
              <p className="item-meta">{event.venue} · {new Date(event.startAt).toLocaleDateString('ko-KR')} — {new Date(event.endAt).toLocaleDateString('ko-KR')}</p>
            </div><button className="btn primary" disabled={pending !== null || event.status !== 'PUBLISHED' || Boolean(event.applicationStatus)}
              onClick={() => void apply(event.id)}>{pending === event.id ? '신청 중…' : state.button}</button></article>
          })}</div>}
      </>}
  </>
}
