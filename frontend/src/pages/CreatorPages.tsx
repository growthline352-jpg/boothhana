import '../features/creator/creator.css'
import { DiscoveryIcon } from '../features/discovery/DiscoveryIcon'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { creatorApi } from '../api'
import { useRemote } from '../app/useRemote'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { PageHeader } from '../components/layout/PageHeader'


export function CreatorHomePage() {
  const tasks = [
    { to: '/discover', step: '01', title: '참가할 행사 찾기', description: '행사 안내에서 내 부스를 바로 등록하세요.', icon: 'calendar' as const },
    { to: '/creator/booths', step: '02', title: '내 부스 준비하기', description: '행사마다 부스 소개와 판매 상품을 따로 관리하세요.', icon: 'grid' as const },
    { to: '/creator/reservations', step: '03', title: '예약 수령 확인하기', description: '예약번호를 찾아 상품 전달 후 수령 완료로 기록하세요.', icon: 'ticket' as const },
    { to: '/creator/pos', step: '04', title: '현장 판매 기록하기', description: '실제 결제는 별도로 진행하고 판매 내역을 기록하세요.', icon: 'check' as const },
  ]
  return <><PageHeader eyebrow="Creator · Dashboard" title="예약·판매 운영" description="행사별 부스를 등록하고, 예약·판매 기능이 있는 행사에서는 현장 운영도 관리합니다." />
    <div className="creator-welcome"><div><span className="eyebrow">내 부스를 위한 작업 공간</span><h2>준비부터 현장까지,<br/>하나씩 차근차근.</h2><p>‘내 공개 행사·부스’에서 직접 등록하거나 연결한 부스의 소개와 상품을 관리하세요.</p></div><Link className="btn primary" to="/support/management">내 공개 행사·부스 <DiscoveryIcon name="arrow" size={18}/></Link></div>
    <div className="creator-task-grid">{tasks.map(task=><Link key={task.to} className="creator-task-card" to={task.to}><div className="creator-task-top"><span className="creator-task-icon"><DiscoveryIcon name={task.icon} size={24}/></span><span>{task.step}</span></div><h2>{task.title}</h2><p>{task.description}</p><span className="creator-task-link">이동하기 <DiscoveryIcon name="arrow" size={18}/></span></Link>)}</div></>
}

export { CreatorEventsPage } from '../features/creator/CreatorEventsPage'

export { CreatorBoothsPage } from '../features/creator/CreatorBoothsPage'

export function CreatorEventBoothPage() {
  const { eventBoothId = '' } = useParams()
  const navigate = useNavigate()
  const booths = useRemote(creatorApi.eventBooths, [])
  const events = useRemote(creatorApi.events, [])
  const booth = booths.data?.find((item) => String(item.id) === eventBoothId)
  const event = events.data?.find((item) => item.id === booth?.eventId)
  const [loadedId, setLoadedId] = useState<number | null>(null)
  const [form, setForm] = useState({ boothNumber: '', intro: '', isPublic: false })
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  useEffect(() => {
    if (booth && booth.id !== loadedId) {
      setForm({ boothNumber: booth.boothNumber, intro: booth.intro, isPublic: booth.isPublic })
      setLoadedId(booth.id)
    }
  }, [booth, loadedId])
  const ended = event?.status === 'ENDED'
  const save = async (submitEvent: FormEvent) => {
    submitEvent.preventDefault()
    if (!booth) return
    setMessage(''); setSubmitting(true)
    try {
      const saved = await creatorApi.updateEventBooth(booth.id, form)
      setForm({ boothNumber: saved.boothNumber, intro: saved.intro, isPublic: saved.isPublic })
      await booths.reload()
      setMessage('행사별 부스 정보를 저장했습니다.')
    }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : '행사별 부스 정보를 저장하지 못했습니다.') }
    finally { setSubmitting(false) }
  }
  const remove = async () => {
    if (!booth || !window.confirm('이 행사에서 부스를 삭제할까요? 기본 부스 정보는 유지됩니다.')) return
    setMessage('')
    try { await creatorApi.deleteEventBooth(booth.id); navigate('/creator/booths') }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : '행사별 부스를 삭제하지 못했습니다.') }
  }
  if (booths.loading || events.loading) return <LoadingState label="행사별 부스 정보를 불러오고 있습니다" />
  if (booths.error || events.error) return <ErrorState error={booths.error ?? events.error ?? new Error('행사별 부스 정보를 불러오지 못했습니다.')} retry={() => void Promise.all([booths.reload(), events.reload()])} />
  if (!booth) return <EmptyState title="행사별 부스를 찾을 수 없습니다" description="내 부스 목록에서 등록된 행사 부스를 다시 선택해 주세요." />
  return <><PageHeader eyebrow="Creator · Event Booth" title={booth.name} description={`${event?.name ?? '행사'}에서 공개할 부스 번호와 소개를 관리합니다.`} actions={<Link className="btn secondary" to="/creator/booths">목록으로</Link>} />{ended && <div className="notice-banner">종료된 행사의 부스 정보는 읽기 전용입니다.</div>}{message && <div className="form-alert">{message}</div>}<form className="panel form-panel wide-form" onSubmit={(submitEvent) => void save(submitEvent)}><div className="form-grid"><label className="field"><span>부스 번호</span><input className="input" required disabled={ended} value={form.boothNumber} onChange={(changeEvent) => setForm({ ...form, boothNumber: changeEvent.target.value })} /></label><label className="check-field"><input type="checkbox" disabled={ended} checked={form.isPublic} onChange={(changeEvent) => setForm({ ...form, isPublic: changeEvent.target.checked })} /> 팬 화면에 공개</label><label className="field full"><span>행사별 부스 소개</span><textarea className="textarea" rows={7} disabled={ended} value={form.intro} onChange={(changeEvent) => setForm({ ...form, intro: changeEvent.target.value })} /></label></div><div className="panel-actions"><button className="btn danger subtle" type="button" disabled={ended || submitting} onClick={() => void remove()}>행사 부스 삭제</button><button className="btn primary" disabled={ended || submitting}>{submitting ? '저장 중…' : '변경 저장'}</button></div></form></>
}

export { CreatorProductsPage } from '../features/creator/CreatorProductsPage'

export { CreatorReservationsPage } from '../features/creator/CreatorReservationsPage'
export { CreatorPosPage } from '../features/creator/CreatorPosPage'
export { CreatorNoticesPage } from '../features/creator/CreatorNoticesPage'
