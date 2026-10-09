import { useState, type FormEvent } from 'react'
import { CatalogBoothList } from './CreatorCatalogBoothPage'
import { Link, useSearchParams } from 'react-router'
import { creatorApi } from '../../api'
import { useRemote } from '../../app/useRemote'
import { useConsoleDraft } from '../../app/useConsoleDraft'
import { PageHeader } from '../../components/layout/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States'
import { ImageUploader } from '../../components/ui/ImageUploader'
import type { BoothSummary } from '../../types'
import { eventBoothLabel, eventDates } from './context'

export function CreatorBoothsPage() {
  const [params]=useSearchParams()
  const returnTo=params.get('returnTo')
  const safeReturn=returnTo&&/^\/creator\/catalog\/events\/\d+\/booths\/new$/.test(returnTo)?returnTo:null
  const state = useRemote("features/creator/CreatorBoothsPage:CreatorBoothsPage:state", creatorApi.booths, [])
  const approved = useRemote("features/creator/CreatorBoothsPage:CreatorBoothsPage:approved", creatorApi.eventBooths, [])
  const events = useRemote("features/creator/CreatorBoothsPage:CreatorBoothsPage:events", creatorApi.events, [])
  const [editing, setEditing, submission] = useConsoleDraft<Partial<BoothSummary> | null>('creator:booths', null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const busy = uploading || submission.pending
  const save = async (event: FormEvent) => {
    event.preventDefault(); setError('')
    if (uploading || !editing?.name?.trim()) { setError('부스명과 이미지 업로드 상태를 확인해 주세요.'); return }
    if (!submission.begin()) return
    try {
      if (editing.id) await creatorApi.updateBooth(editing.id, editing)
      else await creatorApi.createBooth(editing)
      submission.saved(); await Promise.all([state.reload(), approved.reload()])
    } catch (caught) { submission.failed(caught) }
    finally { submission.finish() }
  }
  const remove = async (id: number) => {
    if (busy || !window.confirm('연결된 예약과 판매가 없는 부스만 삭제할 수 있습니다. 삭제할까요?') || !submission.begin()) return
    try { await creatorApi.deleteBooth(id); await Promise.all([state.reload(), approved.reload()]) }
    catch (caught) { submission.failed(caught) }
    finally { submission.finish() }
  }
  return <><PageHeader eyebrow="Creator · Booths" title="내 부스 목록" description="여러 행사에서 재사용할 기본 부스 소개를 관리합니다."
    actions={<button className="btn primary" disabled={busy} onClick={() => { setError(''); setEditing({ name: '', intro: '', snsUrl: '', imageKey: '' }) }}>새 부스</button>} />
    <CatalogBoothList/>
    {safeReturn&&<Link className="btn primary" to={safeReturn}>행사 부스 등록으로 돌아가기</Link>}
    {(error || submission.error) && <div className="form-alert" role="alert">{error || submission.error}</div>}
      {submission.message && <p role="status">{submission.message}</p>}
    <p className="item-meta">작성 중 내용은 이 탭에서만 임시 보관합니다. 새로고침·탭 종료·로그아웃 시 사라집니다. 인증 확인으로 중단된 이미지 업로드는 다시 선택해 주세요.</p>
    {editing && <form className="panel form-panel" onSubmit={(event) => void save(event)}>
      <div className="panel-header"><h2>{editing.id ? '부스 수정' : '부스 등록'}</h2><button className="btn subtle" type="button" disabled={busy} onClick={() => setEditing(null)}>닫기</button></div>
      <fieldset disabled={submission.pending} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}><div className="form-grid">
        <label className="field"><span>부스명</span><input className="input" required maxLength={255} value={editing.name ?? ''} onChange={(event) => setEditing({ ...editing, name: event.target.value })} /></label>
        <label className="field"><span>SNS 주소</span><input className="input" type="url" value={editing.snsUrl ?? ''} onChange={(event) => setEditing({ ...editing, snsUrl: event.target.value })} /></label>
        <ImageUploader key={editing.id ?? 'new'} target="booth" disabled={submission.pending} currentUrl={editing.imageUrl} onBusyChange={setUploading} onUploaded={(imageKey) => setEditing(current => current ? { ...current, imageKey } : null)} />
        <label className="field full"><span>부스 소개</span><textarea className="textarea" rows={4} value={editing.intro ?? ''} onChange={(event) => setEditing({ ...editing, intro: event.target.value })} /></label>
      </div></fieldset><button className="btn primary" disabled={busy}>{submission.pending ? '저장 중…' : '변경 저장'}</button>
    </form>}
    {state.loading ? <LoadingState /> : state.error ? <ErrorState error={state.error} retry={() => void state.reload()} /> : !state.data?.length
      ? <EmptyState title="등록한 부스가 없습니다" description="행사 참가에 사용할 첫 부스를 만들어 보세요." />
      : <div className="console-list">{state.data.map(booth => <article className="list-row" key={booth.id}><div><h2>{booth.name}</h2><p className="item-meta">{booth.intro}</p></div><div className="row-actions"><button className="btn subtle" disabled={busy} onClick={() => setEditing(booth)}>수정</button><button className="btn danger subtle" disabled={busy} onClick={() => void remove(booth.id)}>삭제</button></div></article>)}</div>}
    <div className="section-heading compact"><h2>등록된 예약·판매 행사 부스</h2></div>
    {events.error && <ErrorState error={events.error} retry={() => void events.reload()} />}
    {approved.loading ? <LoadingState /> : approved.error ? <ErrorState error={approved.error} retry={() => void approved.reload()} /> : !approved.data?.length
      ? <EmptyState title="등록된 예약·판매 행사 부스가 없습니다" description="행사에 부스를 등록하면 상품과 공지를 관리할 수 있습니다." />
      : <div className="console-list">{approved.data.map(booth => <article className="list-row" key={booth.id}><div><h2>{eventBoothLabel(booth, events.data ?? [])}</h2><p className="item-meta">{eventDates(events.data?.find(event => event.id === booth.eventId))}</p></div><div className="row-actions"><Link className="btn secondary" to={`/creator/event-booths/${booth.id}`}>부스 정보</Link><Link className="btn secondary" to={`/creator/event-booths/${booth.id}/products`}>상품</Link><Link className="btn secondary" to={`/creator/notices?booth=${booth.id}`}>공지</Link></div></article>)}</div>}
  </>
}
