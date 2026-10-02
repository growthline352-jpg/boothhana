import { useEffect, useRef, useState, type FormEvent } from 'react'
import { creatorApi } from '../../api'
import { useRemote } from '../../app/useRemote'
import { PageHeader } from '../../components/layout/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States'
import { StatusChip } from '../../components/ui/StatusChip'
import type { Reservation } from '../../types'
import { reservationStatusLabel } from './context'

export function CreatorReservationsPage() {
  const state = useRemote(creatorApi.reservations, [])
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<Reservation | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [eventId, setEventId] = useState('')
  const [boothId, setBoothId] = useState('')
  const [status, setStatus] = useState('')
  const request = useRef(0)
  const pickupPending = useRef(false)
  const detail = useRef<HTMLElement>(null)
  useEffect(() => () => { request.current++ }, [])
  useEffect(() => { if (found) detail.current?.focus() }, [found])
  const search = async (event: FormEvent) => {
    event.preventDefault()
    if (pickupPending.current || !query.trim()) return
    const ticket = ++request.current
    setFound(null); setMessage(''); setBusy(true)
    try { const row = await creatorApi.reservationByNumber(query.trim()); if (ticket === request.current) setFound(row) }
    catch (error) { if (ticket === request.current) setMessage(error instanceof Error ? error.message : '예약을 찾지 못했습니다.') }
    finally { if (ticket === request.current) setBusy(false) }
  }
  const show = (row: Reservation) => {
    if (pickupPending.current) return
    request.current++; setBusy(false); setMessage(''); setFound(row)
  }
  const clearDetail = () => {
    request.current++; setBusy(false); setMessage(''); setFound(null)
  }
  const pickup = async () => {
    if (!found || busy || pickupPending.current || found.status !== 'RESERVED') return
    if (!window.confirm(`${found.eventName} · ${found.boothName}\n예약번호 ${found.reservationNo}\n상품을 전달하고 수령 완료로 변경할까요?`)) return
    const ticket = ++request.current
    pickupPending.current = true; setBusy(true); setMessage('')
    try {
      const saved = await creatorApi.pickup(found.id)
      if (ticket === request.current) {
        setFound(saved)
        setMessage(saved.status === 'PICKED_UP' ? '수령 완료로 기록했습니다.'
          : saved.status === 'CANCELED' ? '취소된 예약입니다. 수령 완료로 처리되지 않았습니다.'
          : '수령 완료 상태를 확인하지 못했습니다. 예약 상태를 다시 확인해 주세요.')
        await state.reload()
      }
    } catch (error) { if (ticket === request.current) setMessage(error instanceof Error ? error.message : '수령 처리하지 못했습니다.') }
    finally { pickupPending.current = false; if (ticket === request.current) setBusy(false) }
  }
  const rows = state.data ?? []
  const events = [...new Set(rows.map(row => row.eventName))]
  const booths = [...new Map(rows.filter(row => !eventId || row.eventName === eventId).map(row => [row.eventBoothId, `${row.eventName} · ${row.boothName}`])).entries()]
  const filtered = rows.filter(row => (!eventId || row.eventName === eventId) && (!boothId || String(row.eventBoothId) === boothId) && (!status || row.status === status))
  return <><PageHeader eyebrow="Creator · Reservations" title="예약 확인·수령 처리" description="예약 목록에서 상세를 열거나 예약번호로 검색한 뒤 상품 수령을 확인하세요." />
    <form className="search-panel" onSubmit={event => void search(event)}><input className="input" required value={query} disabled={busy} onChange={event => setQuery(event.target.value)} placeholder="예: RSV-260718-042" aria-label="예약번호 검색" /><button className="btn primary" disabled={busy}>{busy ? '확인 중…' : '검색'}</button></form>
    {message && <p className="notice-banner" role="status">{message}</p>}
    {found && <article className="panel pickup-card" ref={detail} tabIndex={-1} aria-label="예약 상세">
      <div><p className="eyebrow mono">{found.reservationNo}</p><p>{found.eventName}</p><h2>{found.boothName}</h2><ul>{found.items.map(item => <li key={item.id ?? item.eventProductId}>{item.productName ?? item.eventProductId} × {item.quantity}</li>)}</ul></div>
      <div className="row-actions"><StatusChip tone={found.status === 'RESERVED' ? 'active' : 'muted'}>{reservationStatusLabel[found.status]}</StatusChip>
        <button className="btn primary" disabled={busy || found.status !== 'RESERVED'} onClick={() => void pickup()}>수령 완료 처리</button>
        <button className="btn secondary" disabled={busy} onClick={clearDetail}>상세 닫기</button></div>
    </article>}
    <div className="section-heading compact"><h2>예약 목록</h2></div>
    <div className="creator-filters"><label className="field"><span>행사</span><select className="select" disabled={busy} value={eventId} onChange={event => { clearDetail(); setEventId(event.target.value); setBoothId('') }}><option value="">모든 행사</option>{events.map(name => <option key={name}>{name}</option>)}</select></label>
      <label className="field"><span>부스</span><select className="select" disabled={busy} value={boothId} onChange={event => { clearDetail(); setBoothId(event.target.value) }}><option value="">모든 부스</option>{booths.map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select></label>
      <label className="field"><span>수령 상태</span><select className="select" disabled={busy} value={status} onChange={event => { clearDetail(); setStatus(event.target.value) }}><option value="">모든 상태</option>{Object.entries(reservationStatusLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div>
    {state.loading ? <LoadingState label="예약을 불러오고 있습니다" /> : state.error ? <ErrorState error={state.error} retry={() => void state.reload()} /> : !filtered.length ? <EmptyState title={rows.length ? '조건에 맞는 예약이 없습니다' : '예약이 없습니다'} description={rows.length ? '행사·부스·수령 상태를 다시 선택해 주세요.' : '팬의 예약이 생성되면 이곳에 표시됩니다.'} /> : <div className="table-wrap"><table><thead><tr><th>예약번호</th><th>행사</th><th>부스</th><th>상품</th><th>상태</th><th>상세</th></tr></thead><tbody>{filtered.map(row => <tr key={row.id}>
      <td><button className="btn subtle mono" disabled={busy} onClick={() => show(row)}>{row.reservationNo}</button></td><td>{row.eventName}</td><td>{row.boothName}</td><td>{row.items.length}종</td><td>{reservationStatusLabel[row.status]}</td><td><button className="btn secondary" disabled={busy} onClick={() => show(row)} aria-label={`${row.reservationNo} 상세`}>상세 보기</button></td>
    </tr>)}</tbody></table></div>}
  </>
}
