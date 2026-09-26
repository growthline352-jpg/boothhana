import { SaveButton } from '../library/SaveButton'
import { BestsellerSection } from '../goods/BestsellerCarousel'
import { eventStatus } from '../visit/eventStatus'
import { usePageScroll } from '../visit/ScrollMemory'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { useRemote } from '../../app/useRemote'
import { publicCatalogApi, type PublicEventSummary } from '../catalog/api'
import { SafeLink, StoredImage, labels } from '../catalog/Shared'
import { categoryHref, type DiscoveryCategory } from './categories'
import { browseApiParams, cardOccurrences, periodRange, periodLabel, occurrenceLabel, parseBrowse, seoulToday, type Period } from './browse'
import { DiscoveryIcon } from './DiscoveryIcon'
import './discovery.css'
import '../visit/visit.css'

export function DiscoveryPage() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const state = parseBrowse(params)
  const { category } = state
  // Update the date at KST midnight without imposing the browser's local timezone.
  const [today, setToday] = useState(() => seoulToday())
  useEffect(() => { const id = window.setInterval(() => setToday(seoulToday()), 60_000); return () => window.clearInterval(id) }, [])
  const query = browseApiParams(state, today).toString()
  const data = useRemote(() => category.enabled && !state.dateError ? publicCatalogApi.browse(query)
    : Promise.resolve({ items: [] as PublicEventSummary[], page: 0, size: 20, total: 0 }), [query, category.enabled, state.dateError])
  usePageScroll(!data.loading)
  const [draft, setDraft] = useState(state.q)
  useEffect(() => { setDraft(state.q) }, [state.q, category.key])
  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params)
    next.set('category', category.key)
    if (!('page' in changes)) next.delete('page')
    Object.entries(changes).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key))
    setParams(next)
  }
  const submit = (e: FormEvent) => { e.preventDefault(); if (category.enabled) update({ q: draft.trim().slice(0, 100) }) }
  const reset = () => { setDraft(''); setParams({ category: category.key, period: 'all' }) }
  const rows = data.data?.items ?? []
  const total = data.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / 20))
  const range=periodRange(state.period,today,state.from,state.to)
  const returnTo = location.pathname + location.search
  const hasFilter = Boolean(state.q || state.region || state.subcategory || state.period !== 'all')
  return <div className={`discovery-page discovery-theme-${category.key}`}>
    <section className="discovery-hero"><div className="discovery-container discovery-hero-inner">
      <div className="discovery-hero-copy">
        <div className="discovery-eyebrow"><span className="discovery-live-dot"/>{category.eyebrow}</div>
        <h1>{category.title}<br/><em>{category.emphasis}</em></h1>
        <p>{category.description}</p>
        <form className="discovery-search" role="search" onSubmit={submit}>
          <DiscoveryIcon name="search" size={22}/>
          <input type="search" value={draft} onChange={e => setDraft(e.target.value)} maxLength={100}
            placeholder={category.searchHint} aria-label={`${category.label} 행사 검색`} disabled={!category.enabled}/>
          <button type="submit" disabled={!category.enabled}>검색</button>
        </form>
        <div className="discovery-hero-meta"><span><DiscoveryIcon name="pin" size={15}/>서울·경기 · 인천 제외</span>
          <span><DiscoveryIcon name={category.enabled ? 'check' : 'info'} size={15}/>{category.enabled ? '검토·공개된 정보만 안내' : '행사 정보 준비 중'}</span>
        </div>
      </div>
      <HeroTicket category={category}/>
      <div className="discovery-shortcuts" aria-label="방문 준비 바로가기">
        <a href="#discovery-results"><DiscoveryIcon name="calendar"/><span><strong>일정부터 찾기</strong><small>지역과 날짜로 행사 좁히기</small></span><DiscoveryIcon name="arrow" size={17}/></a>
        <Link to="/library"><DiscoveryIcon name="bookmark"/><span><strong>내 보관함</strong><small>관심 부스와 메모 다시 보기</small></span><DiscoveryIcon name="arrow" size={17}/></Link>
        <a href="/offline/index.html"><DiscoveryIcon name="download"/><span><strong>현장에서 열기</strong><small>미리 내려받은 자료 보기</small></span><DiscoveryIcon name="arrow" size={17}/></a>
      </div>
    </div></section>
    <section className="discovery-container discovery-feed" aria-labelledby="discovery-heading" id="discovery-results">
      <div className="discovery-feed-head">
        <div><div className="discovery-section-kicker">날짜와 취향으로 찾는 행사</div><h2 id="discovery-heading">{category.label} 둘러보기</h2></div>
        <p>{category.enabled ? '어떤 하루를 만나고 싶으세요?' : '새로운 분야의 정보를 준비하고 있어요.'}</p>
      </div>
      <div className="discovery-subcategories" role="group" aria-label={`${category.label} 세부 분류`}>
        {category.filters.map(filter => <button key={filter.value} type="button" disabled={!category.enabled}
          className={`discovery-filter-chip${state.subcategory === filter.value ? ' is-selected' : ''}`}
          aria-pressed={state.subcategory === filter.value} onClick={() => update({ type: filter.value })}>
          {filter.value === '' && <DiscoveryIcon name="grid" size={15}/>} {filter.label}
        </button>)}
      </div>
      {category.enabled ? <>
        <div className="discovery-toolbar">
          <div className="discovery-result-count" role="status" aria-live="polite">
            {state.dateError ? '날짜 범위를 확인해 주세요' : data.loading ? '공개된 행사를 확인하고 있어요' : data.error ? '목록을 불러오지 못했어요' : <>공개 행사 <strong>{total.toLocaleString('ko-KR')}</strong>개{hasFilter && <span> · 현재 조건 기준</span>}</>}
          </div>
          <div className="discovery-selects"><label><span className="discovery-select-label">지역</span><select value={state.region} onChange={e=>update({region:e.target.value})}><option value="">서울·경기 전체</option><option value="SEOUL">서울</option><option value="GYEONGGI">경기</option></select></label><label><DiscoveryIcon name="calendar" size={16}/><span className="discovery-select-label">기간</span>
            <select value={state.period} onChange={e => update({ period: e.target.value, from:e.target.value==='custom'?today:'', to:e.target.value==='custom'?today:'' })}>
              <option value="weekend">이번 주말</option><option value="nextmonth">다음 달</option><option value="custom">날짜 선택</option><option value="upcoming">오늘 이후</option><option value="week">앞으로 7일</option><option value="month">이번 달 남은 일정</option><option value="all">전체 기간</option>
            </select></label>
            <label><span className="discovery-select-label">정렬</span><select value={state.sort} onChange={e => update({ sort: e.target.value })}><option value="date">일정순</option><option value="recent">최근 공개순</option></select></label>
          </div>
        </div>
        {state.period==='custom'&&<div className="visit-date-range"><label className="field"><span>시작일</span><input className="input" type="date" aria-invalid={!!state.dateError} aria-describedby={state.dateError?"discovery-date-error":undefined} value={state.from} onChange={e=>update({from:e.target.value})}/></label><label className="field"><span>종료일</span><input className="input" type="date" aria-invalid={!!state.dateError} aria-describedby={state.dateError?"discovery-date-error":undefined} min={state.from} value={state.to} onChange={e=>update({to:e.target.value})}/></label>{state.dateError&&<p id="discovery-date-error" role="alert">{state.dateError}</p>}</div>}
        {hasFilter && <div className="discovery-applied" role="group" aria-label="적용한 검색 조건">
          {state.period !== 'all' && <button type="button" onClick={() => update({ period: 'all', from: '', to: '' })}>{periodLabel(state.period,state.from,state.to)} <DiscoveryIcon name="close" size={13}/><span className="discovery-sr-only">기간 해제</span></button>}
          {state.region && <button type="button" onClick={() => update({ region: '' })}>{state.region === 'SEOUL' ? '서울' : '경기'} <DiscoveryIcon name="close" size={13}/><span className="discovery-sr-only">지역 해제</span></button>}
          {state.q && <button type="button" onClick={() => update({ q: '' })}>“{state.q}” <DiscoveryIcon name="close" size={13}/><span className="discovery-sr-only">검색어 해제</span></button>}
          {state.subcategory && <button type="button" onClick={() => update({ type: '' })}>{category.filters.find(f => f.value === state.subcategory)?.label}<DiscoveryIcon name="close" size={13}/><span className="discovery-sr-only">분류 해제</span></button>}
          <button className="discovery-reset" type="button" onClick={reset}>조건 초기화</button>
        </div>}
        {state.dateError ? <div className="discovery-empty discovery-date-empty"><div className="discovery-empty-icon"><DiscoveryIcon name="calendar" size={30}/></div><h3>날짜 범위를 먼저 확인해 주세요</h3><p>올바른 시작일과 종료일을 선택하면 행사를 검색합니다.</p><button className="discovery-primary" type="button" onClick={() => update({ period: 'all', from: '', to: '' })}>기간 조건 없이 보기</button></div>
          : data.loading ? <div className="discovery-card-grid" aria-busy="true" aria-label="행사 목록 로딩 중">{[0,1,2].map(i => <div className="discovery-skeleton" key={i}><div/><span/><span/><span/></div>)}</div>
          : data.error ? <div className="discovery-empty" role="alert"><div className="discovery-empty-icon"><DiscoveryIcon name="info" size={30}/></div><h3>행사를 불러오지 못했어요</h3><p>연결 상태를 확인하고 다시 시도해 주세요.</p><button type="button" className="discovery-primary" onClick={() => void data.reload()}>다시 불러오기</button></div>
          : rows.length ? <div className="discovery-card-grid">{rows.map(row => <DiscoveryEventCard key={row.id} row={row} today={today} returnTo={returnTo} period={state.period} from={range.from} to={range.to}/>)}</div>
          : <div className="discovery-empty"><div className="discovery-empty-icon"><DiscoveryIcon name="search" size={30}/></div>
            <h3>{state.page > 0 ? '이 페이지에는 행사가 없어요' : hasFilter ? '조건에 맞는 공개 행사가 없어요' : '새로운 행사를 준비하고 있어요'}</h3>
            <p>{state.page > 0 ? '공개 목록이 변경되었을 수 있어요. 첫 페이지에서 다시 확인해 주세요.' : hasFilter ? '검색어와 분류를 바꾸거나 전체 기간으로 확인해 보세요.' : '검토가 끝난 행사부터 소개해 드립니다. 아직 공개되지 않은 정보는 표시하지 않아요.'}</p>
            {state.page > 0 ? <button className="discovery-primary" type="button" onClick={() => update({page:''})}>같은 조건의 첫 페이지로</button>
              : hasFilter && <button className="discovery-primary" type="button" onClick={reset}>전체 공개 행사 보기</button>}
          </div>}
        {!state.dateError && !data.loading && !data.error && total > 0 && state.page < pages && <nav className="discovery-pagination" aria-label="행사 목록 페이지">
          <button type="button" disabled={state.page === 0} onClick={() => update({ page: String(Math.max(0, state.page - 1)) })}>이전</button>
          <span><strong>{state.page + 1}</strong> / {pages}</span>
          <button type="button" disabled={(state.page + 1) * 20 >= total} onClick={() => update({ page: String(state.page + 1) })}>다음</button>
        </nav>}
      </> : <div className="discovery-coming">
        <div className="discovery-coming-icon"><DiscoveryIcon name={category.icon} size={42}/></div>
        <span className="discovery-coming-badge">새로운 카테고리</span><h3>{category.label} 정보를 준비하고 있어요</h3>
        <p>현재는 서브컬처 행사부터 소개하고 있어요.<br/>{category.label}는 정보 수집·공개가 연결되면 이곳에서 확인할 수 있습니다.</p>
        <Link className="discovery-primary" to={categoryHref('subculture')}>서브컬처 먼저 둘러보기 <DiscoveryIcon name="arrow" size={17}/></Link>
        <small>아직 공개된 {category.label} 데이터는 없습니다. 다른 분야의 행사를 대신 표시하지 않습니다.</small>
      </div>}
      <div className="discovery-guide-strip">
        <div className="discovery-guide-label"><DiscoveryIcon name="info"/><strong>방문 전 꼭 확인하세요</strong></div>
        <p>외부 행사 안내는 정보 제공용입니다. 일정·입장 조건·판매 품목은 바뀔 수 있으니 주최 원문을 확인해 주세요.</p>
        <Link to="/events">예약 가능한 행사 <DiscoveryIcon name="arrow" size={16}/></Link>
      </div>
    </section>
    {category.enabled && <BestsellerSection category={category.code}/>}
  </div>
}
export function HeroTicket({ category }: { category: DiscoveryCategory }) {
  return <aside className="discovery-hero-art guide-card" aria-label="부스하나 이용 안내">
    <div className="guide-card-title"><span className="guide-card-symbol"><DiscoveryIcon name={category.icon} size={24}/></span><div><span className="guide-kicker">오프라인에서 만나는 취향</span><strong>방문 준비, 이 순서로</strong></div></div>
    <ol className="guide-steps">
      <li><span className="guide-step-number">01</span><div><strong>가고 싶은 행사 찾기</strong><p>일정과 장소부터 확인해요.</p></div><DiscoveryIcon name="calendar" size={20}/></li>
      <li><span className="guide-step-number">02</span><div><strong>관심 부스 저장하기</strong><p>업체·제품과 관심 이유를 남겨요.</p></div><DiscoveryIcon name="grid" size={20}/></li>
      <li><span className="guide-step-number">03</span><div><strong>다녀온 뒤에도 다시 찾기</strong><p>메모와 방문 기록으로 기억해요.</p></div><DiscoveryIcon name="pin" size={20}/></li>
    </ol>
    <p className="guide-card-note">로그인 없이 행사 정보를 둘러볼 수 있어요.</p>
  </aside>
}
export function DiscoveryEventCard({ row, today, returnTo, period = 'all', from='', to='' }: { row: PublicEventSummary; today: string; returnTo: string; period?: Period; from?:string; to?:string }) {
  const { event, banner } = row
  const schedule = eventStatus(event, today)
  const dates = cardOccurrences(event.occurrences, today, period, 3, from, to)
  const visitDay = dates.shown.length ? (from && dates.shown[0].startDate < from ? from : dates.shown[0].startDate) : ''
  // Poster candidates are intentionally never used; only the backend's approved/stored banner is eligible.
  return <article className="discovery-event-card">
    <Link to={`/discover/${row.id}${visitDay?'?day='+encodeURIComponent(visitDay):''}`} state={{ catalogReturnTo: returnTo }} className="discovery-event-link">
      <div className={`discovery-event-poster discovery-poster-${event.subcategory.toLowerCase()}`}>
        {banner ? <StoredImage url={banner.url} alt={banner.caption || `${event.name} 포스터`}/>
          : <div className="discovery-poster-placeholder"><DiscoveryIcon name="ticket" size={42}/><span>BOOTHHANA GUIDE</span><strong>{labels[event.subcategory] || '행사'}</strong><small>행사 이미지를 준비하고 있어요</small></div>}
        <span className={`discovery-event-status is-${schedule.state}`}>{schedule.label}</span>
      </div>
      <div className="discovery-event-body"><span className="discovery-event-type">{labels[event.subcategory] || '행사'}</span><h3>{event.name}</h3>{schedule.notice&&<p className="visit-important-note">{schedule.notice}</p>}
        <div className="discovery-event-meta"><DiscoveryIcon name="calendar" size={16}/><div>{dates.shown.map((o,i) => <span key={i}>{occurrenceLabel(o)}</span>)}{dates.additional > 0 && <span>같은 조건의 추가 일정 {dates.additional}개 · 상세에서 확인</span>}{dates.omittedPast > 0 && <span>지난 일정 {dates.omittedPast}개는 상세에서 확인</span>}{!dates.shown.length && <span>해당 기간 일정은 상세에서 확인하세요.</span>}</div></div>
        <div className="discovery-event-meta"><DiscoveryIcon name="pin" size={16}/><span>{event.venueName || '장소 미공개·미확인'}</span></div>
        <p className="discovery-event-description">{event.description}</p>
        <div className="discovery-event-bottom"><span>{row.participantCount > 0 ? <>소개된 참가 부스 <strong>{row.participantCount.toLocaleString('ko-KR')}곳</strong></> : '행사 정보 살펴보기'}</span><DiscoveryIcon name="arrow" size={19}/></div>
      </div>
    </Link>
    <div className="memory-discovery-save"><SaveButton target={{type:'EVENT',eventId:row.id,id:row.id,participantId:null}} day={visitDay} compact/></div>
    {banner && <div className="discovery-poster-credit">{banner.credit} · <SafeLink url={banner.attribution}>이미지 출처</SafeLink></div>}
  </article>
}
