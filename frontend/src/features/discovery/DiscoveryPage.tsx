import { SaveButton } from '../library/SaveButton'
import { BestsellerSection } from '../goods/BestsellerCarousel'
import { eventStatus } from '../visit/eventStatus'
import { usePageScroll } from '../visit/ScrollMemory'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { useRemote } from '../../app/useRemote'
import { publicCatalogApi, type PublicEventSummary } from '../catalog/api'
import { SafeLink, labels } from '../catalog/Shared'
import { ContentImage } from '../../components/ui/ContentImage'
import { categoryHref } from './categories'
import { browseApiParams, cardOccurrences, dateLabel, homeBrowseApiParams, homeEventSections, homeRecentApiParams, isDiscoveryResults, latestFeaturedEvents, periodRange, periodLabel, occurrenceLabel, parseBrowse, searchResultsHref, seoulToday, type Period } from './browse'
import { DiscoveryIcon } from './DiscoveryIcon'
import { homeQuickLinks } from './homeQuickLinks'
import { currentSiteCategory } from './site'
import { PopularEvents } from './PopularEvents'
import './discovery.css'
import '../visit/visit.css'

const dateFormatter = new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit', weekday: 'short', timeZone: 'Asia/Seoul' })

export function DiscoveryPage() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const isHome = !isDiscoveryResults(location.pathname, params)
  const state = parseBrowse(params)
  const { category } = state
  const [today, setToday] = useState(() => seoulToday())
  useEffect(() => { const id = window.setInterval(() => setToday(seoulToday()), 60_000); return () => window.clearInterval(id) }, [])
  const query = (isHome ? homeBrowseApiParams(state, today) : browseApiParams(state, today)).toString()
  const data = useRemote(() => category.enabled && !state.dateError ? publicCatalogApi.browse(query)
    : Promise.resolve({ items: [] as PublicEventSummary[], page: 0, size: 20, total: 0 }), [query, category.enabled, state.dateError])
  const recentQuery = homeRecentApiParams(state, today).toString()
  const recent = useRemote(() => isHome && category.enabled ? publicCatalogApi.browse(recentQuery)
    : Promise.resolve({ items: [] as PublicEventSummary[], page: 0, size: 0, total: 0 }), [isHome, category.enabled, recentQuery])
  usePageScroll(!data.loading)
  const [draft, setDraft] = useState(state.q)
  useEffect(() => { setDraft(state.q) }, [state.q, category.key])
  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params)
    if (currentSiteCategory()) next.delete('category')
    else next.set('category', category.key)
    if (!('page' in changes)) next.delete('page')
    Object.entries(changes).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key))
    setParams(next)
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (category.enabled) navigate(searchResultsHref(params, category.key, draft))
  }
  const reset = () => { setDraft(''); setParams(currentSiteCategory() ? { period: 'all', view: 'results' } : { category: category.key, period: 'all', view: 'results' }) }
  const rows = data.data?.items ?? []
  const featuredRows = latestFeaturedEvents(recent.data?.items ?? [], today)
  const total = data.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / 20))
  const range = periodRange(state.period, today, state.from, state.to)
  const returnTo = location.pathname + location.search
  const allEventsHref = searchResultsHref(params, category.key, '')
  const homeSections = homeEventSections(rows, today)
  const hasFilter = Boolean(state.q || state.region || state.subcategory || state.period !== 'all')
  const dateLabel = dateFormatter.format(new Date(`${today}T12:00:00Z`)).replaceAll('.', '')
  const quickLinks = homeQuickLinks(category.key)

  return <div className={`discovery-page discovery-theme-${category.key}`}>
    <section className={`popga-home${isHome ? '' : ' is-results'}`} aria-label={isHome ? `${category.label} 추천` : `${category.label} 행사 검색`}>
      <div className="discovery-container">
        {isHome && currentSiteCategory() && <h1 className="discovery-sr-only">부스하나 {category.label}</h1>}
        <form className="popga-search" role="search" onSubmit={submit}>
          <DiscoveryIcon name="search" size={21}/>
          <input type="search" value={draft} onChange={e => setDraft(e.target.value)} maxLength={100}
            placeholder={category.searchHint} aria-label={`${category.label} 행사 검색`} disabled={!category.enabled}/>
          <button type="submit" disabled={!category.enabled}>검색</button>
        </form>

        {isHome && <><div className="popga-dashboard">
          <aside className="daily-note" aria-labelledby="daily-note-heading">
            <div className="daily-note-head"><span>다가오는 행사 노트</span><strong id="daily-note-heading">{dateLabel}</strong></div>
            <div className="daily-note-tabs" role="group" aria-label="지역 빠른 선택">
              <button className={!state.region ? 'is-current' : ''} aria-pressed={!state.region} type="button" onClick={() => update({ region: '' })}>전체</button>
              <button className={state.region === 'SEOUL' ? 'is-current' : ''} aria-pressed={state.region === 'SEOUL'} type="button" onClick={() => update({ region: 'SEOUL' })}>서울</button>
              <button className={state.region === 'GYEONGGI' ? 'is-current' : ''} aria-pressed={state.region === 'GYEONGGI'} type="button" onClick={() => update({ region: 'GYEONGGI' })}>경기</button>
            </div>
            <div className="daily-note-list">
              {data.loading ? [0, 1, 2].map(i => <div className="daily-note-skeleton" key={i}/>)
                : data.error ? <p className="daily-note-empty">행사 정보를 불러오지 못했어요.</p>
                : rows.slice(0, 3).map(row => <MiniEventRow key={row.id} row={row} today={today} returnTo={returnTo}/>) }
              {!data.loading && !data.error && !rows.length && <p className="daily-note-empty">현재 조건에 맞는 공개 행사가 없습니다.</p>}
            </div>
            <Link className="daily-note-more" to={allEventsHref}>전체 일정 보기 <DiscoveryIcon name="arrow" size={15}/></Link>
          </aside>

          <div className="featured-stage" aria-label="최근 공개된 행사">
            {recent.loading ? <div className="featured-loading" aria-label="최근 공개된 행사 로딩 중"/>
              : recent.error ? <div className="featured-empty" role="alert"><DiscoveryIcon name="info" size={38}/><strong>행사를 불러오지 못했어요</strong><button type="button" onClick={() => void recent.reload()}>다시 불러오기</button></div>
              : featuredRows.length ? <FeaturedCarousel key={`${category.key}:${state.region}`} rows={featuredRows} today={today} returnTo={returnTo}/>
              : <div className="featured-empty"><DiscoveryIcon name="calendar" size={38}/><strong>공개 행사를 준비하고 있어요</strong><span>검토가 끝난 행사부터 소개합니다.</span></div>}
          </div>

          <aside className="home-plan-card" aria-label="부스하나 이용 안내">
            <span className="home-plan-kicker">내 일정 만들기</span><div className="home-plan-icon"><DiscoveryIcon name="bookmark" size={25}/></div>
            <h2>마음에 든 행사를<br/>한곳에 모아보세요</h2><p>행사와 부스를 저장하고 현장에서 다시 확인할 수 있어요.</p>
            <Link to="/library">내 보관함 열기 <DiscoveryIcon name="arrow" size={16}/></Link>
            <div className="home-plan-steps" aria-hidden="true"><span className="is-current">찾기</span><span>저장</span><span>방문</span></div>
          </aside>
        </div>

        <nav className="home-quick-links" aria-label="빠른 행사 찾기">
          {quickLinks.map(item => <Link key={item.label} to={item.to}><span className="home-quick-icon"><DiscoveryIcon name={item.icon} size={24}/></span><strong>{item.label}</strong><small>{item.detail}</small></Link>)}
        </nav>
        </>}
      </div>
    </section>

    {isHome && <>
      <HomeRankingSection id="ranking-heading" title="곧 열리는 행사" description="아직 시작하지 않은 공개 행사를 가까운 일정부터 보여드려요."
        empty="곧 열리는 행사가 없습니다." rows={homeSections.upcoming} loading={data.loading} error={!!data.error}
        today={today} returnTo={returnTo} region={state.region} changeRegion={region => update({ region })} allEventsHref={allEventsHref}/>
      <HomeRankingSection id="closing-heading" title="마감 임박한 행사" description="이미 시작했고, 운영 종료일까지 7일 이내인 행사예요. 예매 마감일과는 다를 수 있어요."
        empty="지금 마감 임박한 행사가 없습니다." rows={homeSections.closing} loading={data.loading} error={!!data.error}
        today={today} returnTo={returnTo} region={state.region} changeRegion={region => update({ region })} allEventsHref={allEventsHref} closing/>
    </>}

    {isHome && <div className="discovery-container"><PopularEvents categoryCode={category.code}/></div>}

    {!isHome && <section className="discovery-container discovery-feed" aria-labelledby="discovery-heading" id="discovery-results">
      <div className="discovery-feed-head"><div><h2 id="discovery-heading">{category.label} 전체보기</h2><p>날짜와 지역, 관심 분야로 원하는 행사를 좁혀보세요.</p></div></div>
      <div className="discovery-subcategories" role="group" aria-label={`${category.label} 세부 분류`}>
        {category.filters.map(filter => <button key={filter.value} type="button" disabled={!category.enabled} className={`discovery-filter-chip${state.subcategory === filter.value ? ' is-selected' : ''}`} aria-pressed={state.subcategory === filter.value} onClick={() => update({ type: filter.value })}>{filter.value === '' && <DiscoveryIcon name="grid" size={15}/>} {filter.label}</button>)}
      </div>
      {category.enabled ? <>
        <div className="discovery-toolbar">
          <div className="discovery-result-count" role="status" aria-live="polite">{state.dateError ? '날짜 범위를 확인해 주세요' : data.loading ? '공개된 행사를 확인하고 있어요' : data.error ? '목록을 불러오지 못했어요' : <>공개 행사 <strong>{total.toLocaleString('ko-KR')}</strong>개{hasFilter && <span> 현재 조건 기준</span>}</>}</div>
          <div className="discovery-selects"><label><span className="discovery-select-label">지역</span><select value={state.region} onChange={e=>update({region:e.target.value})}><option value="">서울·경기 전체</option><option value="SEOUL">서울</option><option value="GYEONGGI">경기</option></select></label><label><DiscoveryIcon name="calendar" size={16}/><span className="discovery-select-label">기간</span><select value={state.period} onChange={e => update({ period: e.target.value, from:e.target.value==='custom'?today:'', to:e.target.value==='custom'?today:'' })}><option value="weekend">이번 주말</option><option value="nextmonth">다음 달</option><option value="custom">날짜 선택</option><option value="upcoming">오늘 이후</option><option value="week">앞으로 7일</option><option value="month">이번 달 남은 일정</option><option value="all">전체 기간</option></select></label><label><span className="discovery-select-label">정렬</span><select value={state.sort} onChange={e => update({ sort: e.target.value })}><option value="date">일정순</option><option value="recent">최근 공개순</option></select></label></div>
        </div>
        {state.period==='custom'&&<div className="visit-date-range"><label className="field"><span>시작일</span><input className="input" type="date" aria-invalid={!!state.dateError} aria-describedby={state.dateError?"discovery-date-error":undefined} value={state.from} onChange={e=>update({from:e.target.value})}/></label><label className="field"><span>종료일</span><input className="input" type="date" aria-invalid={!!state.dateError} aria-describedby={state.dateError?"discovery-date-error":undefined} min={state.from} value={state.to} onChange={e=>update({to:e.target.value})}/></label>{state.dateError&&<p id="discovery-date-error" role="alert">{state.dateError}</p>}</div>}
        {hasFilter && <div className="discovery-applied" role="group" aria-label="적용한 검색 조건">{state.period !== 'all' && <button type="button" onClick={() => update({ period: 'all', from: '', to: '' })}>{periodLabel(state.period,state.from,state.to)} <DiscoveryIcon name="close" size={13}/><span className="discovery-sr-only">기간 해제</span></button>}{state.region && <button type="button" onClick={() => update({ region: '' })}>{state.region === 'SEOUL' ? '서울' : '경기'} <DiscoveryIcon name="close" size={13}/><span className="discovery-sr-only">지역 해제</span></button>}{state.q && <button type="button" onClick={() => update({ q: '' })}>“{state.q}” <DiscoveryIcon name="close" size={13}/><span className="discovery-sr-only">검색어 해제</span></button>}{state.subcategory && <button type="button" onClick={() => update({ type: '' })}>{category.filters.find(f => f.value === state.subcategory)?.label}<DiscoveryIcon name="close" size={13}/><span className="discovery-sr-only">분류 해제</span></button>}<button className="discovery-reset" type="button" onClick={reset}>조건 초기화</button></div>}
        {state.dateError ? <div className="discovery-empty discovery-date-empty"><div className="discovery-empty-icon"><DiscoveryIcon name="calendar" size={30}/></div><h3>날짜 범위를 먼저 확인해 주세요</h3><p>올바른 시작일과 종료일을 선택하면 행사를 검색합니다.</p><button className="discovery-primary" type="button" onClick={() => update({ period: 'all', from: '', to: '' })}>기간 조건 없이 보기</button></div>
          : data.loading ? <div className="discovery-card-grid" aria-busy="true" aria-label="행사 목록 로딩 중">{[0,1,2,3].map(i => <div className="discovery-skeleton" key={i}><div/><span/><span/><span/></div>)}</div>
          : data.error ? <div className="discovery-empty" role="alert"><div className="discovery-empty-icon"><DiscoveryIcon name="info" size={30}/></div><h3>행사를 불러오지 못했어요</h3><p>연결 상태를 확인하고 다시 시도해 주세요.</p><button type="button" className="discovery-primary" onClick={() => void data.reload()}>다시 불러오기</button></div>
          : rows.length ? <div className="discovery-card-grid">{rows.map(row => <DiscoveryEventCard key={row.id} row={row} today={today} returnTo={returnTo} period={state.period} from={range.from} to={range.to}/>)}</div>
          : <div className="discovery-empty"><div className="discovery-empty-icon"><DiscoveryIcon name="search" size={30}/></div><h3>{state.page > 0 ? '이 페이지에는 행사가 없어요' : hasFilter ? '조건에 맞는 공개 행사가 없어요' : '새로운 행사를 준비하고 있어요'}</h3><p>{state.page > 0 ? '공개 목록이 변경되었을 수 있어요. 첫 페이지에서 다시 확인해 주세요.' : hasFilter ? '검색어와 분류를 바꾸거나 전체 기간으로 확인해 보세요.' : '검토가 끝난 행사부터 소개해 드립니다. 아직 공개되지 않은 정보는 표시하지 않아요.'}</p>{state.page > 0 ? <button className="discovery-primary" type="button" onClick={() => update({page:''})}>같은 조건의 첫 페이지로</button> : hasFilter && <button className="discovery-primary" type="button" onClick={reset}>전체 공개 행사 보기</button>}</div>}
        {!state.dateError && !data.loading && !data.error && total > 0 && pages > 1 && state.page < pages && <nav className="discovery-pagination" aria-label="행사 목록 페이지"><button type="button" disabled={state.page === 0} onClick={() => update({ page: String(Math.max(0, state.page - 1)) })}>이전</button><span><strong>{state.page + 1}</strong> / {pages}</span><button type="button" disabled={(state.page + 1) * 20 >= total} onClick={() => update({ page: String(state.page + 1) })}>다음</button></nav>}
      </> : <div className="discovery-coming"><div className="discovery-coming-icon"><DiscoveryIcon name={category.icon} size={42}/></div><h3>{category.label} 정보를 준비하고 있어요</h3><p>검토와 공개가 끝난 정보부터 이곳에서 확인할 수 있습니다.</p><Link className="discovery-primary" to={categoryHref('subculture')}>서브컬처 먼저 둘러보기 <DiscoveryIcon name="arrow" size={17}/></Link></div>}
      <div className="discovery-guide-strip"><div className="discovery-guide-label"><DiscoveryIcon name="info"/><strong>방문 전 확인하세요</strong></div><p>일정과 입장 조건은 바뀔 수 있으니 주최 측 최신 공지를 확인해 주세요.</p><Link to="/events">예약 가능한 행사 <DiscoveryIcon name="arrow" size={16}/></Link></div>
    </section>}
    {category.enabled && <BestsellerSection category={category.code}/>}
  </div>
}

function HomeRankingSection({ id, title, description, empty, rows, loading, error, today, returnTo, region, changeRegion, allEventsHref, closing = false }: {
  id: string; title: string; description: string; empty: string; rows: PublicEventSummary[]; loading: boolean; error: boolean
  today: string; returnTo: string; region: string; changeRegion: (region: string) => void; allEventsHref: string; closing?: boolean
}) {
  return <section className="discovery-container home-ranking" aria-labelledby={id}>
    <div className="home-section-title"><div><h2 id={id}>{title}</h2><p>{description}</p></div><Link to={allEventsHref}>전체보기 <DiscoveryIcon name="arrow" size={16}/></Link></div>
    <div className="home-ranking-tabs" role="group" aria-label={`${title} 지역`}>
      <button className={!region ? 'is-current' : ''} aria-pressed={!region} type="button" onClick={() => changeRegion('')}>전체</button>
      <button className={region === 'SEOUL' ? 'is-current' : ''} aria-pressed={region === 'SEOUL'} type="button" onClick={() => changeRegion('SEOUL')}>서울</button>
      <button className={region === 'GYEONGGI' ? 'is-current' : ''} aria-pressed={region === 'GYEONGGI'} type="button" onClick={() => changeRegion('GYEONGGI')}>경기</button>
    </div>
    {loading ? <div className="home-ranking-grid" aria-busy="true">{[0,1,2,3,4].map(i => <div className="ranking-skeleton" key={i}/>)}</div>
      : error ? <div className="ranking-empty" role="alert">행사 정보를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.</div>
      : rows.length ? <div className="home-ranking-grid">{rows.map((row, index) => <RankingEvent key={row.id} row={row} rank={index + 1} today={today} returnTo={returnTo} closing={closing}/>)}</div>
      : <div className="ranking-empty">{empty}</div>}
  </section>
}

function MiniEventRow({ row, today, returnTo }: { row: PublicEventSummary; today: string; returnTo: string }) {
  const schedule = eventStatus(row.event, today)
  const occurrence = cardOccurrences(row.event.occurrences, today, 'upcoming', 1).shown[0]
  return <Link className="daily-note-item" to={`/discover/${row.id}`} state={{ catalogReturnTo: returnTo }}><span className="daily-note-thumb"><ContentImage url={row.banner?.url} kind="event" alt=""/></span><span className="daily-note-copy"><small>{labels[row.event.subcategory] || '행사'} <b>{schedule.label}</b></small><strong>{row.event.name}</strong><span>{occurrence ? occurrenceLabel(occurrence) : '일정 확인 필요'}</span></span></Link>
}

function FeaturedCarousel({ rows, today, returnTo }: { rows: PublicEventSummary[]; today: string; returnTo: string }) {
  const [selected, setSelected] = useState(0)
  const [paused, setPaused] = useState(false)
  const index = Math.min(selected, rows.length - 1)
  useEffect(() => {
    if (rows.length < 2 || paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => { if (!document.hidden) setSelected(current => (current + 1) % rows.length) }, 6_000)
    return () => window.clearInterval(timer)
  }, [rows.length, paused])
  const move = (step: number) => setSelected(current => (current + step + rows.length) % rows.length)
  return <div className="featured-carousel" role="region" aria-roledescription="carousel" aria-label="최근 공개된 행사"
    onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
    onFocusCapture={() => setPaused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false) }}>
    <FeaturedEvent key={rows[index].id} row={rows[index]} today={today} returnTo={returnTo}/>
    <span className="featured-carousel-label">최근 공개</span>
    {rows.length > 1 && <div className="featured-carousel-controls" aria-label="행사 사진 넘기기">
      <button type="button" onClick={() => move(-1)} aria-label="이전 행사"><DiscoveryIcon name="chevron" size={17}/></button>
      <span aria-live="off">{index + 1} / {rows.length}</span>
      <button type="button" onClick={() => move(1)} aria-label="다음 행사"><DiscoveryIcon name="chevron" size={17}/></button>
    </div>}
  </div>
}

function FeaturedEvent({ row, today, returnTo }: { row: PublicEventSummary; today: string; returnTo: string }) {
  const schedule = eventStatus(row.event, today)
  const occurrence = cardOccurrences(row.event.occurrences, today, 'upcoming', 1).shown[0]
  return <Link className="featured-event" to={`/discover/${row.id}`} state={{ catalogReturnTo: returnTo }}><ContentImage url={row.banner?.url} kind="event" alt={`${row.event.name} 대표 이미지`} loading="eager" fetchPriority="high"/><span className="featured-scrim"/><span className="featured-copy"><small>{occurrence ? occurrenceLabel(occurrence) : schedule.label} / {row.event.region === 'GYEONGGI' ? '경기' : '서울'}</small><strong>{row.event.name}</strong><span>{row.event.venueName || '장소 확인 필요'}</span></span></Link>
}

function RankingEvent({ row, rank, today, returnTo, closing = false }: { row: PublicEventSummary; rank: number; today: string; returnTo: string; closing?: boolean }) {
  const occurrence = cardOccurrences(row.event.occurrences, today, 'upcoming', 1).shown[0]
  const finalDay = row.event.occurrences.reduce((latest, day) => day.endDate > latest ? day.endDate : latest, '')
  return <article className="ranking-event"><span className="ranking-number" aria-label={`${closing ? '마감' : '일정'} 순서 ${rank}`}>{String(rank).padStart(2, '0')}</span><Link to={`/discover/${row.id}`} state={{ catalogReturnTo: returnTo }}><div className="ranking-image"><ContentImage url={row.banner?.url} kind="event" alt={`${row.event.name} 대표 이미지`}/></div><div className="ranking-copy"><strong>{row.event.name}</strong><span>{closing && finalDay ? `${dateLabel(finalDay)} 운영 종료` : occurrence ? occurrenceLabel(occurrence) : '일정 확인 필요'}</span><small>{row.event.venueName || '장소 확인 필요'}</small></div></Link><SaveButton target={{type:'EVENT',eventId:row.id,id:row.id,participantId:null}} compact/></article>
}

export function DiscoveryEventCard({ row, today, returnTo, period = 'all', from='', to='' }: { row: PublicEventSummary; today: string; returnTo: string; period?: Period; from?:string; to?:string }) {
  const { event, banner } = row
  const schedule = eventStatus(event, today)
  const dates = cardOccurrences(event.occurrences, today, period, 3, from, to)
  const visitDay = dates.shown.length ? (from && dates.shown[0].startDate < from ? from : dates.shown[0].startDate) : ''
  return <article className="discovery-event-card"><Link to={`/discover/${row.id}${visitDay?'?day='+encodeURIComponent(visitDay):''}`} state={{ catalogReturnTo: returnTo }} className="discovery-event-link"><div className={`discovery-event-poster discovery-poster-${event.subcategory.toLowerCase()}`}><ContentImage url={banner?.url} kind="event" alt={banner?.caption || `${event.name} 포스터`}/></div><div className="discovery-event-body"><div className="discovery-card-label"><span>{labels[event.subcategory] || '행사'}</span><b className={`is-${schedule.state}`}>{schedule.label}</b></div><h3>{event.name}</h3>{schedule.notice&&<p className="visit-important-note">{schedule.notice}</p>}<div className="discovery-event-meta"><DiscoveryIcon name="calendar" size={16}/><div>{dates.shown.map((o,i) => <span key={i}>{occurrenceLabel(o)}</span>)}{dates.additional > 0 && <span>추가 일정 {dates.additional}개</span>}{dates.omittedPast > 0 && <span>지난 일정 {dates.omittedPast}개</span>}{!dates.shown.length && <span>일정은 상세에서 확인하세요.</span>}</div></div><div className="discovery-event-meta"><DiscoveryIcon name="pin" size={16}/><span>{event.venueName || '장소 미공개 또는 미확인'}</span></div><p className="discovery-event-description">{event.description}</p><div className="discovery-event-bottom"><span>{row.participantCount > 0 ? <>소개된 참가 부스 <strong>{row.participantCount.toLocaleString('ko-KR')}곳</strong></> : '행사 정보 살펴보기'}</span><DiscoveryIcon name="arrow" size={19}/></div></div></Link><div className="memory-discovery-save"><SaveButton target={{type:'EVENT',eventId:row.id,id:row.id,participantId:null}} day={visitDay} compact/></div>{banner && <div className="discovery-poster-credit">{banner.credit} <SafeLink url={banner.attribution}>이미지 출처</SafeLink></div>}</article>
}
