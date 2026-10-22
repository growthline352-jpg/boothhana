import { useEffect, useRef, useState } from 'react'
import { DiscoveryIcon } from '../discovery/DiscoveryIcon'
import { Modal, PlaceImage } from './OutingComponents'
import { PlaceMap } from './PlaceMap'
import { availability, clock, dayLabel, kindLabels, mapLink, money, planGroups, schedule, suggestedStart, today, totals, validDate, validTime, type Place, type Plan, type Stop } from './model'

export type PlannerStage = 'list' | 'edit' | 'preview'
interface Props {
  plans: Plan[]; plan: Plan; stage: PlannerStage; places: Place[]; saved: Place[]; source: 'sample' | 'catalog'; savedAt: string; canUndo: boolean
  account:boolean; busy:boolean; dirtyIds:string[]; savedIds:string[]; save:()=>void
  select: (id: string, stage: PlannerStage) => void; changeStage: (stage: PlannerStage) => void; create: () => void
  patch: (plan: Plan) => void; update: (id: string, changes: Partial<Stop>) => void
  add: (place: Place, index: number) => boolean; move: (index: number, delta: number) => void; remove: (id: string) => void
  open: (place: Place) => void; discover: (index: number) => void; custom: (index: number) => void
  undo: () => void; share: () => void; importFile: () => void; exportFile: () => void; duplicate: () => void; deletePlan: () => void
}

export function PlannerWorkspace(props: Props) {
  const { plans, plan, stage, places, saved, source, patch, update } = props
  const [settings, setSettings] = useState(false), [settingsError, setSettingsError] = useState('')
  const [picker, setPicker] = useState<number | null>(null), [query, setQuery] = useState(''), [category, setCategory] = useState('all')
  const [reorder, setReorder] = useState(false), [dragged, setDragged] = useState<number | null>(null)
  const [more, setMore] = useState(false), [sideOpen, setSideOpen] = useState(false)
  const title = useRef<HTMLHeadingElement>(null)
  useEffect(() => { setPicker(null); setMore(false); setReorder(false); setSideOpen(false) }, [plan.id, stage])
  useEffect(() => { title.current?.focus({ preventScroll: true }) }, [plan.id, stage])
  const rows = schedule(plan), summary = totals(plan), startSuggestion = suggestedStart(plan)
  const durationOptions = (duration: number) => [...new Set([15, 30, 45, 50, 60, 90, 120, 150, 180, 240, duration])].sort((a, b) => a - b)
  const candidates = (category === 'saved' ? saved : places).filter(p =>
    (category === 'all' || category === 'saved' || p.kind === category) &&
    (!query.trim() || `${p.name} ${p.area} ${p.address}`.toLowerCase().includes(query.trim().toLowerCase())))
  function openPicker(index: number) { setPicker(index); setQuery(''); setCategory('all') }
  function setTime(field: 'start' | 'end', value: string) {
    const next = { ...plan, [field]: value }
    if (value && !validTime(value)) return
    if (next.start && next.end && next.start >= next.end) { setSettingsError('종료 시간은 시작 시간보다 늦게 정해 주세요.'); return }
    setSettingsError(''); patch(next)
  }
  function addAt(place: Place, index: number) {
    if (props.add(place, index)) setPicker(index + 1)
  }

  if (stage === 'list') return <section className="p-library">
    <header className="p-heading"><div><p className="o-overline">함께 보내는 하루</p><h1 ref={title} tabIndex={-1}>내 일정</h1><p>다가오는 약속과 지난 하루를 한곳에서 확인하세요.</p></div><button className="o-button" onClick={props.create}>+ 새 일정</button></header>
    {plans.length ? planGroups(plans).map(group => <section className="p-plan-group" key={group.id} aria-labelledby={`plan-group-${group.id}`}>
      <div className="p-group-heading"><h2 id={`plan-group-${group.id}`}>{group.title} <span>{group.plans.length}</span></h2>{group.id === 'examples' && <p>예시 장소로 만든 일정이에요. 실제 행사·예약 정보와 다릅니다.</p>}</div>
      <div className="p-plan-grid">{group.plans.map(p => <article className="p-plan-card" key={p.id}>
        <div className="p-plan-cover" aria-hidden="true">{p.stops.length ? p.stops.slice(0, 3).map(stop => <div className="p-plan-photo" key={stop.id}><PlaceImage place={stop.place}/></div>) : <DiscoveryIcon name="calendar" size={36}/>}</div>
        <div className="p-plan-body"><div className="p-plan-badges"><span className={`p-plan-state ${p.day < today() ? 'is-past' : ''}`}>{p.day < today() ? '지난 일정' : p.day === today() ? '오늘' : '예정'}</span>{p.stops.some(stop => stop.place.source === 'sample') && <span className="p-plan-example">{group.id === 'examples' ? '체험용 예시' : '예시 장소 포함'}</span>}</div>
          <p className="p-meta">{props.account ? props.dirtyIds.includes(p.id) ? '계정에 저장 전 · 기기 초안' : '계정에 저장됨' : '이 기기에 저장됨'}</p><p className="p-meta">{dayLabel(p.day)} · {p.stops.length}곳 · {p.start ? `${p.start} 시작` : '시간 미정'}</p><h3>{p.title || '이름 없는 일정'}</h3><p className="p-plan-path">{p.stops.map(s => s.place.name).join(' → ') || '가보고 싶은 장소부터 담아보세요.'}</p>
          <div className="p-card-actions"><button className="o-button secondary" onClick={() => props.select(p.id, p.stops.length ? 'preview' : 'edit')}>{!p.stops.length ? '장소 담기' : group.id === 'examples' ? '예시 둘러보기' : '일정 보기'}</button>{p.stops.length > 0 && <button className="o-text-button" onClick={() => props.select(p.id, 'edit')}>일정 수정 →</button>}</div>
        </div>
      </article>)}</div>
    </section>) : <div className="o-empty"><DiscoveryIcon name="calendar" size={40}/><h2>어디부터 가볼까요?</h2><p>장소를 먼저 담고 시간은 나중에 정해도 돼요.</p><button className="o-button" onClick={props.create}>첫 일정 만들기</button></div>}
    <button className="o-text-button" onClick={props.importFile}>보관한 일정 파일 가져오기</button>
  </section>

  return <section className={`p-workspace ${stage === 'preview' ? 'is-preview' : ''}`}>
    <div className="p-breadcrumb"><button className="o-text-button" onClick={() => props.changeStage('list')}>← 내 일정</button><span>{stage === 'preview' ? '일정 미리보기' : '일정 만들기'}</span><span className="p-autosave">{props.account ? props.dirtyIds.includes(plan.id) ? '기기 초안 · 계정에 저장해 주세요' : '계정에 저장됨' : '이 기기에 저장됨'}</span></div>
    <header className="p-heading"><div><h1 ref={title} tabIndex={-1}>{plan.title || '함께 보내는 하루'}</h1><p>{dayLabel(plan.day)} · {plan.stops.length}곳 · {plan.start ? `${plan.start} 시작` : '시작시간 미정'}</p></div>
      <div className="p-heading-actions"><button className="o-button" disabled={props.busy||!props.dirtyIds.includes(plan.id)} onClick={props.save}>{props.busy?'저장 중…':props.account?'계정에 저장':'이 기기에 저장'}</button>{stage === 'edit' ? <button className="o-small-button" onClick={() => { setSettingsError(''); setSettings(true) }}>날짜·시간 설정</button> : <button className="o-small-button" onClick={() => props.changeStage('edit')}>일정 수정</button>}<button className="o-small-button" aria-label="일정 더보기" onClick={() => setMore(true)}>•••</button></div>
    </header>
    {stage === 'edit' && <p className="p-guidance">장소를 먼저 담아보세요. 순서와 머무는 시간은 언제든 바꿀 수 있어요.</p>}
    {plan.stops.some(s => s.place.source === 'sample') && <p className="p-sample">예시 장소가 포함된 체험용 일정입니다.</p>}
    <div className="p-layout"><div className="p-canvas">
      {stage === 'edit' && <div className="p-canvas-heading"><h2>함께 갈 곳 <span>{plan.stops.length}</span></h2><button className="o-text-button" disabled={plan.stops.length < 2} aria-pressed={reorder} onClick={() => setReorder(!reorder)}>{reorder ? '순서 편집 마치기' : '순서 바꾸기'}</button></div>}
      {reorder && <p className="p-guidance">카드를 끌어 옮기거나 위·아래 버튼으로 순서를 바꾸세요.</p>}
      {stage === 'edit' && plan.stops.length > 0 && <button className="p-insert" onClick={() => openPicker(0)}>+ 첫 장소 앞에 추가</button>}
      <ol className="p-stops">{rows.map((row, index) => <li key={row.stop.id} draggable={reorder} onDragStart={e => { setDragged(index); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', row.stop.id) }} onDragEnd={() => setDragged(null)} onDragOver={e => { if (reorder) e.preventDefault() }} onDrop={e => { e.preventDefault(); if (reorder && dragged !== null && dragged !== index) props.move(dragged, index - dragged); setDragged(null) }}>
        {index > 0 && <div className="p-travel"><span className="p-route-line"/>{stage === 'edit' ? <details><summary>{row.stop.travel === null ? '이동 확인 필요' : `이동 ${row.stop.travel}분`} <span>조정</span></summary><div className="p-travel-edit"><label>확인한 이동시간 <input type="number" min="0" max="360" aria-label={`${row.stop.place.name}까지 이동시간`} placeholder="미정" value={row.stop.travel ?? ''} onChange={e => { const value = e.target.value; if (!value) update(row.stop.id, { travel: null }); else if (Number(value) >= 0 && Number(value) <= 360) update(row.stop.id, { travel: Math.round(Number(value)) }) }}/> 분</label>{row.stop.place.source !== 'sample' && <a href={mapLink(row.stop.place)} target="_blank" rel="noreferrer">지도에서 확인 ↗</a>}<p>확인 전에는 도착 시간을 계산하지 않아요.</p></div></details> : <span>{row.stop.travel === null ? '이동시간 확인 필요' : `이동 ${row.stop.travel}분`}</span>}</div>}
        <article className={`p-stop-card${dragged === index ? ' is-dragging' : ''}`}>
          <div className="p-stop-top"><span className="p-stop-number">{index + 1}</span><span className="p-stop-timing">{row.start === null ? plan.start ? '이동시간 확인 후 계산' : '방문시간 미정' : `${row.uncertain ? '예상 ' : ''}${clock(row.start)}–${clock(row.end)}`}{row.stop.fixed && <b>예약 {row.stop.fixed}</b>}</span>{stage === 'edit' && <button className="o-icon-button" aria-label={`${row.stop.place.name} 일정에서 빼기`} onClick={() => props.remove(row.stop.id)}><DiscoveryIcon name="close" size={16}/></button>}</div>
          <div className="p-stop-place"><button className="p-stop-image" onClick={() => props.open(row.stop.place)} aria-label={`${row.stop.place.name} 상세 보기`}><PlaceImage place={row.stop.place}/></button><div><span className="p-meta">{kindLabels[row.stop.place.kind]} · {row.stop.place.area || '직접 추가'}</span><h2><button onClick={() => props.open(row.stop.place)}>{row.stop.place.name}</button></h2><p>{row.stop.place.address || '주소 확인 필요'}</p></div></div>
          <div className="p-stop-duration">{stage === 'edit' ? <label>머무는 시간 <select aria-label={`${row.stop.place.name} 머무는 시간`} value={row.stop.duration} onChange={e => update(row.stop.id, { duration: Number(e.target.value) })}>{durationOptions(row.stop.duration).map(m => <option key={m} value={m}>약 {m}분</option>)}</select></label> : <span>약 {row.stop.duration}분 머무르기</span>}<span>{row.stop.place.cost === null ? '비용 미확인' : row.stop.place.cost === 0 ? '입장 무료' : `2인 ${money(row.stop.place.cost)}`}</span></div>
          {reorder && <div className="p-reorder-controls"><button className="o-small-button" disabled={index === 0} onClick={() => props.move(index, -1)} aria-label={`${row.stop.place.name} 위로 이동`}>↑ 위로</button><button className="o-small-button" disabled={index === rows.length - 1} onClick={() => props.move(index, 1)} aria-label={`${row.stop.place.name} 아래로 이동`}>↓ 아래로</button></div>}
          {stage === 'edit' && <details className="p-stop-details"><summary>예약시간·메모{row.stop.fixed || row.stop.note ? ' · 작성됨' : ''}</summary><label className="o-field">예약한 방문시간 <small>예약이 있을 때만 고정하세요.</small><input type="time" aria-label={`${row.stop.place.name} 예약시간`} value={row.stop.fixed} onChange={e => update(row.stop.id, { fixed: e.target.value })}/></label>{row.stop.fixed && <button className="o-text-button" onClick={() => update(row.stop.id, { fixed: '' })}>예약시간 해제</button>}<label className="o-field">나만 보는 메모<textarea maxLength={1000} rows={2} value={row.stop.note} onChange={e => update(row.stop.id, { note: e.target.value })}/></label></details>}
          {row.alerts.filter(a => a !== '이전 장소에서 이동시간을 입력해 주세요').length > 0 && <div className="p-alerts">{row.alerts.filter(a => a !== '이전 장소에서 이동시간을 입력해 주세요').map(a => <p key={a}>{a}</p>)}</div>}
          {stage === 'preview' && <div className="p-visit-actions"><label><input type="checkbox" checked={row.stop.done} onChange={e => update(row.stop.id, { done: e.target.checked })}/> 방문 완료</label>{row.stop.place.source !== 'sample' && <a href={mapLink(row.stop.place)} target="_blank" rel="noreferrer">지도에서 찾기 ↗</a>}{row.stop.place.sourceUrl && <a href={row.stop.place.sourceUrl} target="_blank" rel="noreferrer">공식 안내 ↗</a>}</div>}
        </article>
        {stage === 'edit' && <button className="p-insert" onClick={() => openPicker(index + 1)}>+ {index === rows.length - 1 ? '다음 장소 추가' : '여기에 장소 추가'}</button>}
      </li>)}</ol>
      {!rows.length && <div className="p-empty"><DiscoveryIcon name="pin" size={40}/><h2>꼭 가고 싶은 곳 하나부터</h2><p>행사, 카페, 식사를 하나의 하루로 연결해 보세요.</p><button className="o-button" onClick={() => openPicker(0)}>장소 골라 담기</button></div>}
    </div>
    <aside className={`p-side${sideOpen ? ' is-open' : ''}`}><button className="p-side-toggle o-small-button" onClick={() => setSideOpen(!sideOpen)} aria-expanded={sideOpen}>{sideOpen ? '지도·요약 접기' : '지도·일정 요약 보기'}</button><div className="p-side-content"><section className="p-summary"><h2>우리의 하루</h2><dl><div><dt>담은 장소</dt><dd>{summary.count}곳</dd></div><div><dt>머무는 시간 합계</dt><dd>{plan.stops.reduce((n, s) => n + s.duration, 0)}분</dd></div><div><dt>마지막 장소 종료</dt><dd>{clock(summary.finish)}</dd></div><div><dt>확인한 2인 비용</dt><dd>{money(summary.cost)}{summary.unknownCost > 0 && <small>미확인 {summary.unknownCost}곳 별도</small>}</dd></div></dl><p>{summary.unknownTravel ? `이동 ${summary.unknownTravel}구간을 확인하면 시간표가 이어져요.` : '이동시간은 직접 확인한 값으로 계산해요.'}</p><p>쇼핑·추가 주문 비용은 별도예요.</p></section>{rows.length > 0 && <PlaceMap places={plan.stops.map(s => s.place)} onSelect={props.open} itinerary/>}</div></aside></div>
    <div className="p-bottom-actions"><div><strong>{plan.stops.length}곳 담았어요</strong><span>{plan.start ? `${plan.start} 시작` : '시간은 나중에 정해도 돼요'}</span></div>{stage === 'edit' ? <><button className="o-button secondary" onClick={() => openPicker(plan.stops.length)}>+ 장소 담기</button><button className="o-button" disabled={!rows.length} onClick={() => props.changeStage('preview')}>일정 미리보기 →</button></> : <><button className="o-button secondary" onClick={() => props.changeStage('edit')}>수정하기</button><button className="o-button" disabled={!rows.length} onClick={props.share}>일정 보내기</button></>}</div>

    {settings && <Modal title="일정 이름과 날짜·시간" close={() => setSettings(false)}><div className="o-dialog-body"><p className="o-helper">날짜는 행사 운영일 확인에 사용해요. 시작·종료시간은 비워둬도 괜찮아요.</p><label className="o-field">일정 이름<input maxLength={100} value={plan.title} onChange={e => patch({ ...plan, title: e.target.value })}/></label><label className="o-field">가는 날<input type="date" value={plan.day} onChange={e => { if (validDate(e.target.value)) patch({ ...plan, day: e.target.value }) }}/></label><div className="o-edit-fields"><label>시작시간 · 선택<input type="time" value={plan.start} onChange={e => setTime('start', e.target.value)}/></label><label>종료시간 · 선택<input type="time" value={plan.end} onChange={e => setTime('end', e.target.value)}/></label></div>{startSuggestion && !plan.start && <button className="o-text-button" onClick={() => setTime('start', startSuggestion)}>첫 장소 운영 시작 {startSuggestion}로 설정</button>}{(plan.start || plan.end) && <button className="o-text-button" onClick={() => { setSettingsError(''); patch({ ...plan, start: '', end: '' }) }}>시작·종료시간 나중에 정하기</button>}{settingsError && <p className="o-warning" role="alert">{settingsError}</p>}<button className="o-button full" onClick={() => setSettings(false)}>완료</button></div></Modal>}
    {picker !== null && <Modal title="일정에 장소 담기" close={() => setPicker(null)} wide><div className="o-dialog-body p-picker"><p className="p-picker-context">{picker === 0 ? '첫 장소 앞에' : `‘${plan.stops[picker - 1]?.place.name ?? '마지막 장소'}’ 다음에`} 담아요.</p><label className="o-search"><DiscoveryIcon name="search" size={18}/><input aria-label="담을 장소 검색" placeholder="장소 이름 또는 동네" value={query} onChange={e => setQuery(e.target.value)}/></label><div className="p-picker-tabs" role="group" aria-label="담을 장소 종류">{[['all', '전체'], ['saved', '찜한 곳'], ['cafe', '카페'], ['food', '식사'], ['walk', '산책']].map(([id, label]) => <button key={id} aria-pressed={category === id} onClick={() => setCategory(id)}>{label}</button>)}</div><p className="o-helper">{category === 'saved' ? '보관함의 장소입니다.' : source === 'sample' ? '화면 체험용 가상 장소입니다.' : '불러온 공개 행사입니다. 카페·식당 검색 데이터는 아직 연결 전이에요.'}</p><div className="p-picker-results">{candidates.map(p => { const added = plan.stops.some(s => s.place.id === p.id), closed = availability(p, plan.day) === 'closed'; return <article key={p.id}><div className="p-picker-image"><PlaceImage place={p}/></div><div><small>{kindLabels[p.kind]} · {p.area || '직접 추가'}{p.source === 'sample' ? ' · 예시' : ''}</small><strong>{p.name}</strong><span>{p.duration}분 · {p.cost === null ? '비용 미확인' : p.cost === 0 ? '입장 무료' : `2인 ${money(p.cost)}`}</span></div><button className="o-small-button" disabled={added || closed} aria-label={`${p.name} 일정에 담기`} onClick={() => addAt(p, picker)}>{added ? '담았어요' : closed ? '운영일 다름' : '+ 담기'}</button></article> })}{!candidates.length && <p className="p-picker-empty">이 조건의 장소가 없어요. 다른 종류를 고르거나 직접 추가해 주세요.</p>}</div><div className="p-picker-links"><button className="o-text-button" onClick={() => { props.custom(picker); setPicker(null) }}>+ 아는 장소 직접 추가</button><button className="o-text-button" onClick={() => { props.discover(picker); setPicker(null) }}>행사 전체에서 찾기 ↗</button></div><div className="p-picker-done"><span aria-live="polite">이 일정에 {plan.stops.length}곳 담았어요</span><button className="o-button" onClick={() => setPicker(null)}>담기 완료</button></div></div></Modal>}
    {more && <Modal title="일정 관리" close={() => setMore(false)}><div className="o-dialog-body p-more"><button className="o-button secondary" disabled={!props.canUndo} onClick={() => { props.undo(); setMore(false) }}>이전 수정 되돌리기</button><button className="o-button secondary" onClick={() => { props.duplicate(); setMore(false) }}>이 일정 복사</button><button className="o-button secondary" onClick={props.exportFile}>파일로 보관</button><button className="o-button secondary" onClick={() => { props.importFile(); setMore(false) }}>일정 파일 가져오기</button><button className="o-text-button" onClick={() => { props.deletePlan(); setMore(false) }}>일정 삭제</button></div></Modal>}
  </section>
}
