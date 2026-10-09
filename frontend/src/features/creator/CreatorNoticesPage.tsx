import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useBlocker, useSearchParams } from 'react-router'
import { creatorApi } from '../../api'
import { useRemote } from '../../app/useRemote'
import { PageHeader } from '../../components/layout/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States'
import { StatusChip } from '../../components/ui/StatusChip'
import type { BoothNotice, BoothSummary, EventSummary } from '../../types'
import { eventBoothLabel, noticeTargetsBooth } from './context'

const blank = { title: '', body: '', pinned: false }
const content = (value: Partial<BoothNotice>) => JSON.stringify([value.title, value.body, value.pinned])

export function CreatorNoticesPage() {
  const booths = useRemote("features/creator/CreatorNoticesPage:CreatorNoticesPage:booths", creatorApi.eventBooths, [])
  const events = useRemote("features/creator/CreatorNoticesPage:CreatorNoticesPage:events", creatorApi.events, [])
  const [params, setParams] = useSearchParams()
  const selected = params.get('booth') || String(booths.data?.[0]?.id ?? '')
  if (booths.loading || events.loading) return <LoadingState />
  if (booths.error || events.error) return <ErrorState error={booths.error ?? events.error!} retry={() => void Promise.all([booths.reload(), events.reload()])} />
  if (!booths.data?.length) return <EmptyState title="공지할 행사 부스가 없습니다" description="행사 참가 승인이 완료되면 공지를 작성할 수 있습니다." />
  // A different URL (including Back/Forward) always gets a new editor and request scope.
  return <NoticeWorkspace key={selected} boothId={selected} booths={booths.data} events={events.data ?? []}
    select={id => setParams({ booth: id })} />
}

function NoticeWorkspace({ boothId, booths, events, select }: {
  boothId: string; booths: BoothSummary[]; events: EventSummary[]; select: (id: string) => void
}) {
  const booth = booths.find(item => String(item.id) === boothId)
  const state = useRemote("features/creator/CreatorNoticesPage:NoticeWorkspace:state", () => booth ? creatorApi.notices(boothId) : Promise.resolve([]), [boothId])
  const [editing, setEditing] = useState<Partial<BoothNotice>>(blank)
  const [baseline, setBaseline] = useState<Partial<BoothNotice>>(blank)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const sending = useRef(false)
  const dirty = content(editing) !== content(baseline)
  const blocker = useBlocker(dirty || busy)
  const ended = events.find(item => item.id === booth?.eventId)?.status === 'ENDED'
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (!busy && window.confirm('저장하지 않은 공지 내용이 있습니다. 내용을 버리고 이동할까요?')) blocker.proceed()
    else blocker.reset()
  }, [blocker, busy])
  useEffect(() => {
    if (!dirty && !busy) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty, busy])
  const edit = (notice: Partial<BoothNotice>) => {
    if (busy || (dirty && !window.confirm('작성 중인 내용을 버리고 다른 공지를 열까요?'))) return
    setEditing(notice); setBaseline(notice); setMessage('')
  }
  const run = async (action: () => Promise<unknown>, success: string) => {
    if (sending.current || !booth || ended) return
    sending.current = true; setBusy(true); setMessage('')
    try { await action(); setMessage(success); await state.reload() }
    catch (error) { setMessage(error instanceof Error ? error.message : '공지를 변경하지 못했습니다.') }
    finally { sending.current = false; setBusy(false) }
  }
  const save = (event: FormEvent) => {
    event.preventDefault()
    if (!noticeTargetsBooth(editing, boothId, state.data)) {
      setMessage('선택한 부스의 공지가 아닙니다. 목록에서 다시 선택해 주세요.'); return
    }
    void run(async () => {
      if (editing.id) await creatorApi.updateNotice(editing.id, editing)
      else await creatorApi.saveNotice(boothId, editing)
      setEditing(blank); setBaseline(blank)
    }, '공지를 저장했습니다.')
  }
  return <><PageHeader eyebrow="Creator · Notices" title="공지 관리" description="선택한 행사 부스의 공지를 작성하고 관리합니다." />
    <label className="field"><span>공지할 행사·부스</span><select className="select" value={booth ? boothId : ''} disabled={busy} onChange={event => select(event.target.value)}>
      {!booth && <option value="">부스를 선택해 주세요</option>}
      {booths.map(item => <option key={item.id} value={item.id}>{eventBoothLabel(item, events)}</option>)}
    </select></label>
    {message && <p className="notice-banner" role="status">{message}</p>}
    {!booth ? <EmptyState title="행사 부스를 선택해 주세요" description="관리할 수 있는 부스를 목록에서 선택하세요." /> : <>
      {ended && <p className="notice-banner">종료된 행사의 공지는 읽기 전용입니다.</p>}
      <div className="split-layout"><form className="panel form-panel" onSubmit={save}>
        <div className="panel-header"><h2>{editing.id ? '공지 수정' : '새 공지'}</h2><button type="button" className="btn secondary" disabled={busy} onClick={() => edit(blank)}>{editing.id ? '수정 취소' : '내용 비우기'}</button></div>
        <p className="item-meta">{eventBoothLabel(booth, events)}</p>
        <fieldset className="creator-fields" disabled={busy || ended}>
          <label className="field"><span>제목</span><input className="input" required value={editing.title ?? ''} onChange={event => setEditing({ ...editing, title: event.target.value })} /></label>
          <label className="field"><span>내용</span><textarea className="textarea" required rows={6} value={editing.body ?? ''} onChange={event => setEditing({ ...editing, body: event.target.value })} /></label>
          <label className="check-field"><input type="checkbox" checked={editing.pinned ?? false} onChange={event => setEditing({ ...editing, pinned: event.target.checked })} /> 부스 상단 고정</label>
          <button className="btn primary">{busy ? '저장 중…' : '공지 저장'}</button>
        </fieldset>
      </form><section><h2>공지 목록</h2>{state.loading ? <LoadingState /> : state.error ? <ErrorState error={state.error} retry={() => void state.reload()} /> : !state.data?.length ? <EmptyState title="등록한 공지가 없습니다" description="현장 안내가 생기면 공지를 작성하세요." /> : <div className="console-list">{state.data.map(notice => <article className="list-row notice-row" key={notice.id}>
        <div>{notice.pinned && <StatusChip tone="warning">상단 고정</StatusChip>}<h3>{notice.title}</h3><p>{notice.body}</p></div>
        <div className="row-actions">{!notice.pinned && <button className="btn secondary" disabled={busy || ended} onClick={() => void run(() => creatorApi.pinNotice(notice.id), '상단에 고정했습니다.')}>고정</button>}
          <button className="btn subtle" disabled={busy || ended} onClick={() => edit(notice)}>수정</button>
          <button className="btn danger subtle" disabled={busy || ended} onClick={() => {
            if (!window.confirm(`${eventBoothLabel(booth, events)}의 ‘${notice.title}’ 공지를 삭제할까요?`)) return
            void run(async () => { await creatorApi.deleteNotice(notice.id); if (editing.id === notice.id) { setEditing(blank); setBaseline(blank) } }, '공지를 삭제했습니다.')
          }}>삭제</button></div>
      </article>)}</div>}</section></div>
    </>}
  </>
}
