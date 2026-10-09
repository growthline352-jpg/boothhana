import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { adminApi } from '../../api'
import { useRemote } from '../../app/useRemote'
import { useConsoleDraft } from '../../app/useConsoleDraft'
import { ErrorState, LoadingState } from '../../components/ui/States'
import { PageHeader } from '../../components/layout/PageHeader'
import type { EventStatus, EventSummary } from '../../types'

const blankEvent: Partial<EventSummary> = { name: '', venue: '', description: '', startAt: '', endAt: '', reservationStartAt: '', reservationEndAt: '', status: 'DRAFT', removeImage: false }
export function AdminEventFormPage() {
  const { eventId = 'new' } = useParams()
  return <EventEditor key={eventId} eventId={eventId} />
}
function EventEditor({ eventId }: { eventId: string }) {
  const navigate = useNavigate()
  const existing = useRemote("features/admin/AdminEventFormPage:EventEditor:existing", () => eventId !== 'new' ? adminApi.event(eventId) : Promise.resolve(null), [eventId])
  const [draft, setDraft, submission] = useConsoleDraft<Partial<EventSummary> | null>(`admin:event:${eventId}`, null)
  const [error, setError] = useState('')
  const value = draft ?? existing.data ?? blankEvent
  const update = (part: Partial<EventSummary>) => setDraft({ ...value, ...part })
  const save = async (event: FormEvent) => {
    event.preventDefault(); setError('')
    if (!value.name?.trim() || !value.venue?.trim() || !value.startAt || !value.endAt) { setError('행사명, 기간, 장소를 입력해 주세요.'); return }
    if (new Date(value.startAt) >= new Date(value.endAt)) { setError('행사 시작일은 종료일보다 빨라야 합니다.'); return }
    if (value.reservationStartAt && value.reservationEndAt && new Date(value.reservationStartAt) >= new Date(value.reservationEndAt)) { setError('예약 시작일은 예약 종료일보다 빨라야 합니다.'); return }
    if (!submission.begin()) return
    try {
      const payload = { ...value,
        startAt: new Date(value.startAt).toISOString(), endAt: new Date(value.endAt).toISOString(),
        reservationStartAt: value.reservationStartAt ? new Date(value.reservationStartAt).toISOString() : undefined,
        reservationEndAt: value.reservationEndAt ? new Date(value.reservationEndAt).toISOString() : undefined,
        // Explicit deletion, independent of whether an imageKey was omitted by an older client.
        removeImage: value.removeImage === true,
      }
      if (eventId !== 'new') await adminApi.updateEvent(Number(eventId), payload)
      else await adminApi.createEvent(payload)
      submission.saved()
      if (submission.isCurrent()) void navigate('/admin/events')
    } catch (caught) { submission.failed(caught) }
    finally { submission.finish() }
  }
  if (existing.loading) return <LoadingState label="행사 정보를 불러오고 있습니다" />
  if (existing.error) return <ErrorState error={existing.error} retry={() => void existing.reload()} />
  return <><PageHeader eyebrow="Admin · Event" title="행사 등록/수정" description="행사 기본 정보와 운영 기간을 입력합니다." />
    <p className="item-meta">작성 중 내용은 이 탭에서만 임시 보관합니다. 새로고침·탭 종료·로그아웃 시 사라집니다.</p>
    <form className="panel form-panel wide-form" onSubmit={(event) => void save(event)}>
      {(error || submission.error) && <div className="form-alert" role="alert">{error || submission.error}</div>}
      {submission.message && <p role="status">{submission.message}</p>}
      <fieldset disabled={submission.pending} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}><h2>행사 기본정보</h2><div className="form-grid">
        <label className="field full"><span>행사명</span><input className="input" required maxLength={255} value={value.name ?? ''} onChange={(event) => update({ name: event.target.value })} /></label>
        <label className="field"><span>행사 시작</span><input className="input" type="datetime-local" required value={toLocal(value.startAt)} onChange={(event) => update({ startAt: event.target.value })} /></label>
        <label className="field"><span>행사 종료</span><input className="input" type="datetime-local" required value={toLocal(value.endAt)} onChange={(event) => update({ endAt: event.target.value })} /></label>
        <label className="field"><span>예약 시작</span><input className="input" type="datetime-local" value={toLocal(value.reservationStartAt)} onChange={(event) => update({ reservationStartAt: event.target.value })} /></label>
        <label className="field"><span>예약 종료</span><input className="input" type="datetime-local" value={toLocal(value.reservationEndAt)} onChange={(event) => update({ reservationEndAt: event.target.value })} /></label>
        <label className="field full"><span>장소</span><input className="input" required maxLength={255} value={value.venue ?? ''} onChange={(event) => update({ venue: event.target.value })} /></label>
        <label className="field full"><span>행사 소개</span><textarea className="textarea" rows={6} value={value.description ?? ''} onChange={(event) => update({ description: event.target.value })} /></label>
        {value.imageUrl && <div className="field full"><span>기존 행사 이미지</span><img src={value.imageUrl} alt="기존 행사 대표 이미지" style={{ maxWidth: 240, maxHeight: 160, objectFit: 'contain' }} /><label className="check-field"><input type="checkbox" checked={value.removeImage ?? false} onChange={(event) => update({ removeImage: event.target.checked })} /> 저장할 때 기존 이미지 삭제</label></div>}
        <label className="field"><span>행사 상태</span><select className="select" value={value.status} onChange={(event) => update({ status: event.target.value as EventStatus })}><option value="DRAFT">준비중</option><option value="PUBLISHED">공개중</option><option value="ENDED">종료</option></select></label>
      </div></fieldset><div className="panel-actions">{!submission.pending && <Link className="btn secondary" to="/admin/events" onClick={() => setDraft(null)}>취소</Link>}<button className="btn primary" disabled={submission.pending}>{submission.pending ? '저장 중…' : '행사 저장'}</button></div>
    </form>
  </>
}
function toLocal(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}
