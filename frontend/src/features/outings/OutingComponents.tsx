import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { openCatalogDialog } from '../catalog/dialogLifecycle'
import { DiscoveryIcon } from '../discovery/DiscoveryIcon'
import { availability, clock, kindLabels, mapLink, money, schedule, type Place, type Plan, type Stop } from './model'

export function Modal({ title, children, close, wide = false }: { title: string; children: ReactNode; close: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null), heading = useRef<HTMLHeadingElement>(null)
  const [trigger] = useState(() => document.activeElement as HTMLElement | null)
  useEffect(() => ref.current ? openCatalogDialog(ref.current, heading.current, trigger) : undefined, [trigger])
  return <dialog className={`o-dialog${wide ? ' wide' : ''}`} ref={ref} onCancel={e => { e.preventDefault(); close() }}>
    <header><h2 ref={heading} tabIndex={-1}>{title}</h2><button className="o-icon-button" aria-label="닫기" onClick={close}><DiscoveryIcon name="close"/></button></header>{children}
  </dialog>
}
export function PlaceImage({ place }: { place: Place }) {
  const [failed, setFailed] = useState(false)
  return place.image && !failed ? <img src={place.image} alt="" loading="lazy" onError={() => setFailed(true)}/> : <div className={`o-place-fallback ${place.kind}`}><DiscoveryIcon name={place.kind === 'cafe' || place.kind === 'food' ? 'ticket' : 'pin'} size={42}/><span>{kindLabels[place.kind]}</span></div>
}
export function PlaceCard({ place, saved, added, day, onOpen, onSave, onAdd, addLabel = '일정에 추가' }: { addLabel?: string; place: Place; saved: boolean; added: boolean; day: string; onOpen: () => void; onSave: () => void; onAdd: () => void }) {
  const closed = availability(place, day) === 'closed'
  const hours = place.hours.find(h => h.from <= day && h.to >= day && h.open && h.close)
  return <article className="o-place-card">
    <div className="o-card-image"><button className="o-image-link" onClick={onOpen} aria-label={`${place.name} 자세히 보기`}><PlaceImage place={place}/></button>
      <span className={`o-kind ${place.kind}`}>{kindLabels[place.kind]}</span>
      <button className={`o-save${saved ? ' is-saved' : ''}`} aria-label={`${place.name} ${saved ? '보관 해제' : '보관하기'}`} aria-pressed={saved} title={saved ? "보관함에서 빼기" : "나중에 보려고 저장"} onClick={onSave}><DiscoveryIcon name="bookmark" size={19}/>{saved && <span className="o-saved-label">저장됨</span>}</button>
      {place.source === 'sample' && <span className="o-sample-tag">예시</span>}
    </div>
    <div className="o-card-content"><p className="o-card-location"><DiscoveryIcon name="pin" size={13}/>{place.area || '지역 미확인'}<span>{place.indoor === true ? '실내' : place.indoor === false ? '야외' : '실내외 미확인'}</span></p>
      <h3><button onClick={onOpen}>{place.name}</button></h3><p className="o-card-description">{place.description}</p>
      <p className="o-card-hours"><DiscoveryIcon name="calendar" size={14}/>{closed ? '선택한 날 운영 없음' : hours ? `${hours.open}–${hours.close}` : '운영시간 확인 필요'}</p>
      <div className="o-card-bottom"><span>{place.cost === null ? '비용 확인 필요' : place.cost === 0 ? '입장 무료' : `2인 ${money(place.cost)}`}</span>
        <button className={`o-add${added ? ' added' : ''}`} disabled={added || closed} onClick={onAdd} aria-label={`${place.name} ${addLabel}`}>{added ? <><DiscoveryIcon name="check" size={14}/> 담았어요</> : closed ? '날짜 확인 필요' : <>{addLabel}<DiscoveryIcon name="arrow" size={14}/></>}</button>
      </div>{availability(place, day) === 'closed' && <p className="o-card-warning">선택한 날짜에는 운영하지 않아요</p>}
    </div>
  </article>
}
export function PlaceDetail({ place, day, added, saved, onAdd, onSave, close, addLabel = '이 장소 일정에 추가' }: { addLabel?: string; place: Place; day: string; added: boolean; saved: boolean; onAdd: () => void; onSave: () => void; close: () => void }) {
  const closed = availability(place, day) === 'closed'
  const hours = place.hours.filter(h => h.from <= day && h.to >= day)
  return <Modal title={place.name} close={close} wide><div className="o-detail-image"><PlaceImage place={place}/></div><div className="o-dialog-body">
    <div className="o-inline"><span className="o-tag">{kindLabels[place.kind]}</span><span>{place.area}</span>{place.source === 'sample' && <span className="o-tag">체험용 예시</span>}</div>
    <p className="o-detail-description">{place.description}</p><div className="o-tags">{place.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
    <dl className="o-facts"><div><dt>선택한 날</dt><dd>{day}</dd></div><div><dt>운영시간</dt><dd>{hours.length ? hours.map((h, i) => <span key={i}>{h.open && h.close ? `${h.open} ~ ${h.close}` : '시간 미확인'} </span>) : place.hours.length ? '이 날짜에는 운영하지 않아요' : '운영일·시간 미확인'}</dd></div>
      <div><dt>위치</dt><dd>{place.address || '상세 주소 미확인'}</dd></div><div><dt>비용</dt><dd>{place.cost === null ? '미확인' : place.cost === 0 ? '입장 무료 · 구매 비용 별도' : `2인 ${money(place.cost)}`}</dd></div>
      <div><dt>머무는 시간</dt><dd>{place.duration}분으로 시작 · 일정에서 수정 가능</dd></div>{place.admission && <div><dt>입장 안내</dt><dd>{place.admission}</dd></div>}</dl>
    {place.booking && <p className="o-warning">{place.booking}</p>}
    {place.source === 'sample' && <p className="o-helper">화면 체험용 가상 행사입니다. 사진·위치·시간·금액은 실제 행사 안내가 아닙니다.</p>}
    <div className="o-inline o-links">{place.source !== 'sample' && <a href={mapLink(place)} target="_blank" rel="noreferrer">외부 지도에서 찾기 ↗</a>}{place.eventId && <a href={`/discover/${place.eventId}?day=${day}`} target="_blank" rel="noreferrer">기존 행사·부스 안내 ↗</a>}{place.sourceUrl && <a href={place.sourceUrl} target="_blank" rel="noreferrer">공식 안내 ↗</a>}</div>
    <div className="o-dialog-actions o-detail-actions"><button className="o-button secondary" onClick={onSave}>{saved ? '보관 해제' : '나중에 보려고 저장'}</button><button className="o-button" disabled={added || closed} onClick={() => { onAdd(); close() }}>{added ? '이미 일정에 담았어요' : closed ? '다른 날짜를 선택해 주세요' : addLabel}</button></div>
  </div></Modal>
}
export function Timeline({ plan, update, move, remove, open, compact = false }: { plan: Plan; update: (id: string, changes: Partial<Stop>) => void; move: (index: number, direction: number) => void; remove: (id: string) => void; open: (p: Place) => void; compact?: boolean }) {
  const rows = schedule(plan)
  return <ol className={`o-timeline${compact ? ' compact' : ''}`}>{rows.map((row, index) => <li className={row.stop.done ? 'visited' : ''} key={row.stop.id}>
    {index > 0 && <div className="o-travel"><span className="o-travel-line"/>{compact ? <span>{row.stop.travel === null ? '이동시간 미입력' : `이동 ${row.stop.travel}분`}</span> : <><label>이동 <input aria-label={`${row.stop.place.name}까지 이동시간`} type="number" min="0" max="360" placeholder="미정" value={row.stop.travel ?? ''} onChange={e => { const value = e.target.value; if (value === '') update(row.stop.id, { travel: null }); else if (Number(value) >= 0 && Number(value) <= 360) update(row.stop.id, { travel: Math.round(Number(value)) }) }}/><span>분</span></label><small>직접 입력</small></> }</div>}
    <div className="o-stop-head"><span className="o-stop-number">{index + 1}</span><div className="o-stop-main"><div className="o-stop-time">{row.uncertain ? '예상 ' : ''}{clock(row.start)} {!compact && <span>~ {clock(row.end)}</span>}{row.stop.fixed && <span className="o-fixed">시간 고정</span>}</div><button className="o-stop-name" onClick={() => open(row.stop.place)}>{row.stop.place.name}</button><p>{kindLabels[row.stop.place.kind]} · {row.stop.duration}분{row.stop.place.source === 'sample' ? ' · 예시' : ''}</p></div>
      {!compact && <div className="o-stop-controls"><button className="o-icon-button" disabled={!index} aria-label={`${row.stop.place.name} 위로 이동`} onClick={() => move(index, -1)}>↑</button><button className="o-icon-button" disabled={index === rows.length - 1} aria-label={`${row.stop.place.name} 아래로 이동`} onClick={() => move(index, 1)}>↓</button><button className="o-icon-button" aria-label={`${row.stop.place.name} 일정에서 빼기`} onClick={() => remove(row.stop.id)}><DiscoveryIcon name="close" size={16}/></button></div>}
    </div>
    {!compact && <div className="o-stop-body">{row.wait > 0 && <p className="o-helper">다음 고정 시간까지 {row.wait}분 여유</p>}
      {row.alerts.length > 0 && <div className="o-stop-alerts">{row.alerts.map(alert => <p key={alert}><DiscoveryIcon name="info" size={14}/>{alert}</p>)}</div>}
      <details className="o-stop-edit"><summary>시간·메모 수정</summary><div className="o-edit-fields"><label>머무는 시간<select value={row.stop.duration} onChange={e => update(row.stop.id, { duration: Number(e.target.value) })}>{[...new Set([15, 30, 45, 50, 60, 90, 120, 150, 180, 240, row.stop.duration])].sort((a, b) => a - b).map(m => <option key={m} value={m}>{m}분</option>)}</select></label><label>방문 시간 고정<input type="time" value={row.stop.fixed} onChange={e => update(row.stop.id, { fixed: e.target.value })}/></label></div>{row.stop.fixed && <button className="o-text-button" onClick={() => update(row.stop.id, { fixed: '' })}>시간 고정 해제</button>}<label className="o-field">개인 메모<textarea maxLength={1000} rows={2} value={row.stop.note} placeholder="예약 번호, 만나기로 한 곳…" onChange={e => update(row.stop.id, { note: e.target.value })}/></label></details>
      <div className="o-stop-footer"><label><input type="checkbox" checked={row.stop.done} onChange={e => update(row.stop.id, { done: e.target.checked })}/> 다녀왔어요</label>{row.stop.place.source !== 'sample' && <a href={mapLink(row.stop.place)} target="_blank" rel="noreferrer">길찾기 ↗</a>}</div>
    </div>}
  </li>)}</ol>
}
export function CustomPlaceForm({ add, close }: { add: (p: Place) => void; close: () => void }) {
  const [kind, setKind] = useState<Place['kind']>('cafe')
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = new FormData(e.currentTarget), name = String(form.get('name') || '').trim()
    if (!name) return
    const rawCost = String(form.get('cost') || '')
    add({ id: `custom-${crypto.randomUUID()}`, name, kind, area: '', address: String(form.get('address') || '').trim(), description: '직접 추가한 장소', image: '', tags: [], hours: [], duration: Number(form.get('duration') || 60), cost: rawCost === '' ? null : Number(rawCost), indoor: null, booking: '', source: 'custom' }); close()
  }
  return <Modal title="우리만의 장소 추가" close={close}><form className="o-dialog-body" onSubmit={submit}><p className="o-helper">카페, 식사, 잠깐의 휴식도 일정에 넣어보세요.</p><label className="o-field">어떤 시간인가요?<select value={kind} onChange={e => setKind(e.target.value as Place['kind'])}><option value="cafe">카페</option><option value="food">식사</option><option value="walk">산책·휴식</option><option value="custom">다른 장소</option></select></label><label className="o-field">장소 이름<input name="name" required maxLength={150} placeholder="예: 만나기로 한 카페"/></label><label className="o-field">주소 또는 동네 <small>선택</small><input name="address" maxLength={500} placeholder="지도에서 찾을 수 있는 주소"/></label><div className="o-edit-fields"><label>머무는 시간<select name="duration" defaultValue="60">{[15, 30, 45, 60, 90, 120].map(m => <option key={m} value={m}>{m}분</option>)}</select></label><label>2인 예상 비용<input name="cost" type="number" min="0" max="10000000" step="100" placeholder="모르면 비워두세요"/></label></div><p className="o-helper">직접 추가한 장소의 영업시간은 따로 확인해 주세요.</p><button className="o-button full" type="submit">일정에 추가</button></form></Modal>
}
