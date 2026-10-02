import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { adminApi } from '../api'
import { useRemote } from '../app/useRemote'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { PageHeader } from '../components/layout/PageHeader'
import { StatusChip } from '../components/ui/StatusChip'


export function AdminEventsPage() {
  const state = useRemote(adminApi.events, [])
  const [params,setParams]=useSearchParams(),q=params.get('q')||'',status=params.get('status')||''
  const filter=(key:string,value:string)=>setParams(previous=>{const next=new URLSearchParams(previous);if(value)next.set(key,value);else next.delete(key);return next},{replace:true})
  const rows=(state.data||[]).filter(e=>(!status||e.status===status)&&(!q||[e.name,e.venue].join(' ').toLocaleLowerCase().includes(q.trim().toLocaleLowerCase())))

  const [message, setMessage] = useState('')
  const remove = async (id: number) => { if (!window.confirm('연결된 신청·예약·판매가 없는 행사만 삭제할 수 있습니다. 삭제할까요?')) return; try { await adminApi.deleteEvent(id); await state.reload() } catch (caught) { setMessage(caught instanceof Error ? caught.message : '행사를 삭제하지 못했습니다.') } }
  const changeStatus = async (id: number, action: 'publish' | 'end') => { try { if (action === 'publish') await adminApi.publishEvent(id); else await adminApi.endEvent(id); await state.reload() } catch (caught) { setMessage(caught instanceof Error ? caught.message : '상태를 변경하지 못했습니다.') } }
  return <><PageHeader eyebrow="Admin · Events" title="예약·참가신청 행사" description="부스하나의 참가신청·예약 운영 행사입니다. 행사 탐색에 공개하는 정보는 공개 행사 관리에서 수정하세요." actions={<Link className="btn primary" to="/admin/events/new">행사 등록</Link>} />{message && <div className="form-alert">{message}</div>}<div className="filter-bar"><input className="input" type="search" placeholder="행사명, 장소 검색" aria-label="관리자 행사 검색" value={q} maxLength={100} onChange={e=>filter('q',e.target.value)} /><select className="select" aria-label="행사 상태" value={status} onChange={e=>filter('status',e.target.value)}><option value="">전체 상태</option><option value="DRAFT">초안</option><option value="PUBLISHED">공개</option><option value="ENDED">종료</option></select></div>{state.loading ? <LoadingState label="행사를 불러오고 있습니다" /> : state.error ? <ErrorState error={state.error} retry={() => void state.reload()} /> : !rows.length ? <EmptyState title="조건에 맞는 운영 행사가 없습니다" description="검색 조건을 확인하거나 참가신청용 행사를 등록하세요." action={<Link className="btn primary" to="/admin/events/new">행사 등록</Link>} /> : <div className="table-wrap"><table><thead><tr><th>행사</th><th>기간</th><th>장소</th><th>상태</th><th>관리</th></tr></thead><tbody>{rows.map((event) => <tr key={event.id}><td><strong>{event.name}</strong><small>{event.description}</small></td><td>{event.startAt.slice(0, 10)} — {event.endAt.slice(0, 10)}</td><td>{event.venue}</td><td><StatusChip tone={event.status === 'PUBLISHED' ? 'active' : event.status === 'ENDED' ? 'muted' : 'warning'}>{event.status}</StatusChip></td><td><div className="row-actions"><Link className="btn subtle" to={`/admin/events/${event.id}`}>수정</Link>{event.status === 'DRAFT' && <button className="btn secondary" onClick={() => void changeStatus(event.id, 'publish')}>공개</button>}{event.status === 'PUBLISHED' && <button className="btn secondary" onClick={() => void changeStatus(event.id, 'end')}>종료</button>}<button className="btn danger subtle" onClick={() => void remove(event.id)}>삭제</button></div></td></tr>)}</tbody></table></div>}</>
}

export { AdminEventFormPage } from '../features/admin/AdminEventFormPage'

export function AdminApplicationsPage() {
  const state = useRemote(adminApi.applications, [])
  const [message, setMessage] = useState('')
  const decide = async (id: number, decision: 'approve' | 'reject', revision: number) => { try { if (decision === 'approve') await adminApi.approve(id, revision); else { const reason = window.prompt('반려 사유를 입력해 주세요.') ?? ''; if (!reason.trim()) return; await adminApi.reject(id, reason, revision) } await state.reload() } catch (caught) { setMessage(caught instanceof Error ? caught.message : '신청 상태를 변경하지 못했습니다.') } }
  return <><PageHeader eyebrow="Admin · Applications" title="행사 참가 신청" description="크리에이터의 부스 참가 신청을 확인하고 승인 또는 반려합니다." />{message && <div className="form-alert">{message}</div>}{state.loading ? <LoadingState label="참가 신청을 불러오고 있습니다" /> : state.error ? <ErrorState error={state.error} retry={() => void state.reload()} /> : !state.data?.length ? <EmptyState title="대기 중인 참가 신청이 없습니다" description="새 신청이 접수되면 이곳에 표시됩니다." /> : <div className="table-wrap"><table><thead><tr><th>행사</th><th>부스</th><th>크리에이터</th><th>상태</th><th>관리</th></tr></thead><tbody>{state.data.map((application) => <tr key={application.id}><td>{application.eventName}</td><td>{application.boothName}</td><td>{application.creatorName}</td><td><StatusChip tone={application.status === 'APPROVED' ? 'active' : application.status === 'REJECTED' ? 'danger' : 'warning'}>{application.status}</StatusChip></td><td><div className="row-actions"><button className="btn primary" disabled={application.status !== 'PENDING'} onClick={() => void decide(application.id, 'approve', application.revision)}>승인</button><button className="btn secondary" disabled={application.status !== 'PENDING'} onClick={() => void decide(application.id, 'reject', application.revision)}>반려</button></div></td></tr>)}</tbody></table></div>}</>
}
