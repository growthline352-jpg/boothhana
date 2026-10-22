import { ShareDialog } from '../itinerary/ShareDialog'
import type { Plan as AccountPlan } from '../itinerary/model'
import { toAccountPlan } from './accountAdapter'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useRemote } from '../../app/useRemote'
import { DiscoveryIcon, type IconName } from '../discovery/DiscoveryIcon'
import { loadCatalog, loadLegacySaved, samples } from './data'
import { availability, dayLabel, exportPlan, importPlan, kindLabels, insertStop, moveStop, newPlan, newStop, today, validDate, weekend, type Place, type PlaceKind, type Plan, type Stop } from './model'
import { useOutings } from './useOutings'
import { CustomPlaceForm, Modal, PlaceCard, PlaceDetail } from './OutingComponents'
import { PlaceMap } from './PlaceMap'
import { OutingsFooter } from './OutingsFooter'
import { OutingsLogo } from './OutingsLogo'
import { PlannerWorkspace, type PlannerStage } from './PlannerWorkspace'

type View = 'discover' | 'map' | 'plans' | 'saved'
const nav: { id: View; label: string; icon: IconName }[] = [{ id: 'discover', label: '발견', icon: 'sparkles' }, { id: 'map', label: '지도', icon: 'pin' }, { id: 'plans', label: '내 일정', icon: 'calendar' }, { id: 'saved', label: '보관함', icon: 'bookmark' }]
const eventKinds = ['popup', 'exhibition', 'festival', 'subculture']
const templates = [
  { title: '성수에서 느긋한 오후', detail: '팝업 구경 + 카페 + 산책', ids: ['sample-1', 'sample-cafe', 'sample-walk'], tag: '가볍게 시작', photo: '/assets/brand/outings/sample-popup.jpg' },
  { title: '전시 보고, 취향 나누고', detail: '리빙 페어 + 식사 + 카페', ids: ['sample-2', 'sample-food', 'sample-cafe'], tag: '실내 위주', photo: '/assets/brand/outings/sample-exhibition.jpg' },
  { title: '노을까지 함께하는 하루', detail: '팝업 + 카페 + 가을마켓', ids: ['sample-1', 'sample-cafe', 'sample-3'], tag: '저녁까지', photo: '/assets/brand/outings/sample-festival.jpg' },
]

export function OutingsApp() {
  const account=useOutings()
  return <OutingsWorkspace key={account.owner} account={account}/>
}

function OutingsWorkspace({account}:{account:ReturnType<typeof useOutings>}) {
  const { state, write, error, savedAt, undo, canUndo } = account
  const member = account.owner.startsWith('member:')
  const [sharePlan,setSharePlan] = useState<AccountPlan|null>(null), [deleting,setDeleting] = useState(false), [latest,setLatest] = useState(false)
  const [params, setParams] = useSearchParams()
  const view = nav.some(n => n.id === params.get('view')) ? params.get('view') as View : 'discover'
  const [draft] = useState(() => newPlan())
  const activePlan = state.plans.find(p => p.id === state.activeId)
  const plan = activePlan ?? draft
  const [browseDay, setBrowseDay] = useState(weekend)
  const [addingToPlan, setAddingToPlan] = useState(false)
  const [templateIndex, setTemplateIndex] = useState<number | null>(null)
  const upcoming = state.plans.filter(p => p.day >= today() && p.stops.length > 0 && p.stops.some(stop => stop.place.source !== 'sample'))
  const continuing = upcoming.find(p => p.id === state.activeId) ?? upcoming[0]
  const stage: PlannerStage = activePlan && ['edit', 'preview'].includes(params.get('stage') || '') ? params.get('stage') as PlannerStage : 'list'
  const [insertionIndex, setInsertionIndex] = useState<number | null>(null)
  const [pendingPlace, setPendingPlace] = useState<Place | null>(null)
  const appending = !!activePlan && (view === 'plans' && stage !== 'list' || addingToPlan)
  const discoveryDay = addingToPlan && activePlan ? plan.day : browseDay
  const [source, setSource] = useState<'sample' | 'catalog'>('catalog')
  const catalogDay = today()
  const catalogResult = useRemote('features/outings/catalog', () => source === 'catalog'
    ? loadCatalog(AbortSignal.timeout(75000)) : Promise.resolve({ places: [] as Place[], limited: false }), [source, catalogDay])
  const catalog = catalogResult.data?.places ?? [], limited = catalogResult.data?.limited ?? false
  const loading = catalogResult.loading
  const loadError = catalogResult.error ? '행사를 불러오지 못했어요. 잠시 후 다시 불러와 주세요.' : ''
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [sort, setSort] = useState('default')
  const [q, setQ] = useState(''), [area, setArea] = useState(''), [kind, setKind] = useState<PlaceKind | ''>(''), [indoor, setIndoor] = useState(false), [free, setFree] = useState(false)
  const [selected, setSelected] = useState<Place | null>(null), [custom, setCustom] = useState(false), [share, setShare] = useState(false), [examples, setExamples] = useState(false)
  const [message, setMessage] = useState(''), [legacyBusy, setLegacyBusy] = useState(false)
  useEffect(() => { if (!message) return; const timeout = window.setTimeout(() => setMessage(''), 4500); return () => window.clearTimeout(timeout) }, [message])
  const file = useRef<HTMLInputElement>(null), heading = useRef<HTMLHeadingElement>(null)
  const searchArea = useRef<HTMLElement>(null), lastView = useRef(view)
  useEffect(() => {
    if (lastView.current !== view) { heading.current?.focus({ preventScroll: true }); window.scrollTo({ top: 0 }); lastView.current = view }
  }, [view])
  function navigate(next: View, append = appending) { setAddingToPlan(append); setParams(next === 'discover' ? {} : { view: next }); setMessage('') }
  function patchPlan(next: Plan) { write({ ...state, plans: state.plans.map(p => p.id === next.id ? { ...next, updatedAt: new Date().toISOString() } : p) }) }
  function openPlanner(next: PlannerStage) { setAddingToPlan(next !== 'list'); setInsertionIndex(null); setParams(next === 'list' ? { view: 'plans' } : { view: 'plans', stage: next }); window.scrollTo({ top: 0 }) }
  function startWith(place: Place) {
    const next = newPlan(browseDay); next.title = `${place.area || '우리'}에서 보내는 하루`; next.stops = [newStop(place)]
    addPlan(next, false); setPendingPlace(null); setMessage(`${place.name}, 새 일정에 담았어요. 계속 골라보세요.`)
  }
  function addPlace(place: Place, at = insertionIndex ?? plan.stops.length): boolean {
    if (!appending) {
      if (activePlan) { setPendingPlace(place); return false }
      if (!account.ready) { setMessage('저장할 계정을 먼저 확인해 주세요.'); return false }
    if (state.plans.length >= 50) { setMessage('일정은 최대 50개까지 보관할 수 있어요.'); return false }
      startWith(place); return true
    }
    if (availability(place, plan.day) === 'closed') { setMessage('일정 날짜에는 운영하지 않는 장소예요. 날짜를 확인해 주세요.'); return false }
    if (plan.stops.some(s => s.place.id === place.id)) { setMessage('이미 이 일정에 담은 장소예요.'); return false }
    if (plan.stops.length >= 30) { setMessage('한 일정에는 최대 30곳까지 담을 수 있어요.'); return false }
    patchPlan(insertStop(plan, place, at)); if (insertionIndex !== null) setInsertionIndex(at + 1)
    setMessage(`${place.name}, 일정에 담았어요.`); return true
  }
  function savePlace(place: Place) {
    if(!account.ready) {setMessage('계정 상태를 먼저 확인해 주세요.');return}
    const exists = state.saved.some(p => p.id === place.id)
    if (!exists && state.saved.length >= 200) { setMessage('보관함에는 최대 200곳까지 담을 수 있어요.'); return }
    write({ ...state, saved: exists ? state.saved.filter(p => p.id !== place.id) : [place, ...state.saved] }); setMessage(exists ? '보관함에서 뺐어요. 작성한 일정은 유지돼요.' : '보관함에 저장했어요. 나중에 일정으로 가져올 수 있어요.')
  }
  function addPlan(next: Plan, open = true) {
    if (!account.ready) { setMessage('저장할 계정을 먼저 확인해 주세요.'); return }
    if (state.plans.length >= 50) { setMessage('기기에는 최대 50개의 일정을 보관할 수 있어요.'); return }
    write({ ...state, plans: [next, ...state.plans], activeId: next.id }); setAddingToPlan(true); setInsertionIndex(null); if (open) { setParams({ view: 'plans', stage: 'edit' }); window.scrollTo({ top: 0 }) }
  }
  function updateStop(id: string, changes: Partial<Stop>) { patchPlan({ ...plan, stops: plan.stops.map(s => s.id === id ? { ...s, ...changes } : s) }) }
  function removeStop(id: string) {
    const index = plan.stops.findIndex(s => s.id === id)
    patchPlan({ ...plan, stops: plan.stops.filter(s => s.id !== id).map((s, i) => i === index ? { ...s, travel: null } : s) }); setMessage('일정에서 뺐어요. 되돌리기로 복구할 수 있어요.')
  }
  async function bringSaved() {
    setLegacyBusy(true)
    try { const places = await loadLegacySaved(); write(previous => ({ ...previous, saved: [...new Map([...previous.saved, ...places].map(p => [p.id, p])).values()].slice(0, 200) })); setMessage(places.length ? `${places.length}개의 공개 행사를 확인했어요. 기존 메모와 방문 기록은 그대로예요.` : '이 주소의 브라우저에 저장된 기존 행사가 없어요. 다른 포트·도메인의 기록은 자동으로 읽을 수 없어요.') }
    catch (e) { setMessage(e instanceof Error ? e.message : '보관함을 가져오지 못했어요.') } finally { setLegacyBusy(false) }
  }
  const allPlaces = source === 'sample' ? samples : catalog
  const eventPlaces = allPlaces.filter(p => eventKinds.includes(p.kind))
  const areas = [...new Set(eventPlaces.map(p => p.area))]
  const filtered = useMemo(() => (view === 'saved' ? state.saved : eventPlaces).filter(p =>
    (!q || `${p.name} ${p.description} ${p.address} ${p.tags.join(' ')}`.toLowerCase().includes(q.trim().toLowerCase())) &&
    (!area || p.area === area) && (!kind || p.kind === kind) && (!indoor || p.indoor === true) && (!free || p.cost === 0) &&
    (view === 'saved' || availability(p, discoveryDay) !== 'closed')),
  [view, state.saved, eventPlaces, q, area, kind, indoor, free, discoveryDay])
  const ordered = [...filtered].sort((a, b) => sort === 'cost' ? (a.cost ?? Infinity) - (b.cost ?? Infinity) : sort === 'duration' ? a.duration - b.duration : 0)
  const filterCount = [q.trim(), kind, area, indoor, free].filter(Boolean).length
  const spotlight = source === 'sample' && !filterCount && view === 'discover' && !addingToPlan
  function resetFilters() { setQ(''); setArea(''); setKind(''); setIndoor(false); setFree(false) }
  const stopProps = { plan, update: updateStop, move: (i: number, d: number) => { patchPlan(moveStop(plan, i, d)); setMessage('순서를 바꿨어요. 달라진 구간의 이동시간을 다시 확인해 주세요.') }, remove: removeStop, open: setSelected }
  function chooseTemplate(index: number) {
    const template = templates[index], next = newPlan(browseDay)
    next.title = template.title; next.stops = template.ids.map(id => newStop(samples.find(p => p.id === id)!))
    if (index === 2) next.stops[2].fixed = '16:00'
    addPlan(next); setExamples(false); setTemplateIndex(null); setMessage('새 예시 일정을 만들었어요. 이동시간과 머무는 시간을 바꿔보세요.')
  }
  function exportFile() {
    const url = URL.createObjectURL(new Blob([exportPlan(plan)], { type: 'application/json' })), link = document.createElement('a')
    link.href = url; link.download = `boothhana-${plan.day}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  async function saveAccount() { try { await account.store.save(plan.id); setMessage(member ? '계정에 저장했어요. 다른 기기에서도 이어서 볼 수 있어요.' : '이 기기에 저장했어요.') } catch(e) { setMessage(e instanceof Error ? e.message : '저장하지 못했어요.') } }
  function openShare() { try { setSharePlan(toAccountPlan(plan, account.store.personal.read().records.find(r=>r.plan.id===plan.id)?.plan)); setShare(true) } catch(e) { setMessage(e instanceof Error?e.message:'공유할 일정을 확인해 주세요.') } }
  useEffect(() => { setShare(false);setSharePlan(null);setDeleting(false);setLatest(false);setMessage('') }, [account.owner])
  useEffect(() => {
    const id=params.get('plan');if(!id||!account.ready)return
    if(state.plans.some(p=>p.id===id)){write({...state,activeId:id});setParams({view:'plans',stage:'edit'})}
    else {setMessage('이 계정에서 일정을 찾지 못했어요.');setParams({view:'plans'})}
  }, [account.ready,params,state,write,setParams])
  return <div className="outings-app">
    <a className="o-skip" href="#outing-main" onClick={e => { e.preventDefault(); document.getElementById("outing-main")?.focus() }}>본문 바로가기</a>
    <div className="o-preview-bar"><span>함께 보내는 하루</span><p>팝업·박람회·축제를 하나의 일정으로.</p><span>{member?'계정 저장 지원':'로그인하면 계정 저장'}</span></div>
    <header className="o-header"><a href="/outings" className="o-brand" aria-label="부스하나 함께 보내는 하루 홈" onClick={e => { e.preventDefault(); navigate('discover') }}><OutingsLogo/></a>
      <nav aria-label="주 메뉴">{nav.map(n => <button key={n.id} aria-current={view === n.id ? 'page' : undefined} onClick={() => { resetFilters(); navigate(n.id) }}><DiscoveryIcon name={n.icon} size={18}/>{n.label}{n.id === 'plans' && state.plans.length > 0 && <span className="o-nav-count">{state.plans.length}</span>}</button>)}</nav>
      <div className="o-header-tools">{member?<span>내 계정</span>:<a href={account.auth.loginUrl}>로그인</a>}<a href="https://subculture.boothana.kr/">서브컬처 ↗</a></div>
    </header>
    <main id="outing-main" className={`o-main view-${view}${appending && view !== 'plans' ? ' has-basket' : ''}`} tabIndex={-1}>
      {error && <div className="o-warning" role="alert">{error}<button onClick={()=>void (account.owner?account.store.refresh():account.auth.refresh())}>다시 확인</button></div>}
      {view==='plans'&&<section className="o-account-panel" aria-label="일정 저장 안내"><div><strong>{member?'기존 일정과 같은 내 계정에 저장해요':'로그인하면 다른 기기에서도 이어서 볼 수 있어요'}</strong><p>{member?'편집 내용은 기기 초안에 보관됩니다. 계정에 저장을 눌러 수정 내용을 반영하세요.':'비회원 일정은 이 기기에 보관됩니다. 로그인 후 계정으로 가져올 수 있어요.'}</p></div>{member?<button className="o-small-button" disabled={account.busy} onClick={()=>void account.store.refresh()}>최신 목록 확인</button>:<a className="o-button" href={account.auth.loginUrl}>로그인</a>}<a href="/itinerary?step=0">행사 중심 일정 만들기</a></section>}
      {view==='plans'&&account.imports.length>0&&<section className="o-account-panel" aria-label="기기 일정 가져오기"><h2>이 기기에 남아 있는 일정 {account.imports.length}개</h2><p>원본은 보관하고 계정에 한 번만 가져옵니다. 숨기기는 이 계정의 가져오기 목록에만 적용돼요.</p>{account.imports.map(row=><div className="o-inline" key={row.key}><span>{row.plan.title||'이름 없는 일정'} · {row.plan.day}</span><button className="o-small-button" disabled={account.busy} onClick={()=>void account.store.importOne(row.key).then(()=>setMessage('계정으로 가져왔어요.')).catch(e=>setMessage(e instanceof Error?e.message:'가져오지 못했어요.'))}>계정으로 가져오기</button><button className="o-text-button" disabled={account.busy} onClick={()=>{try{account.store.hideImport(row.key);setMessage("가져오기 목록에서 숨겼어요. 이 기기의 원본은 남아 있어요.")}catch(e){setMessage(e instanceof Error?e.message:"설정을 저장하지 못했어요.")}}}>목록에서 숨기기</button></div>)}</section>}
      {view==='plans'&&account.conflict&&<div className="o-warning"><p>작성 내용은 기기에 남아 있어요. 최신 계정 일정을 확인하거나 새 사본으로 저장하세요.</p><button onClick={()=>{void account.store.refresh();setLatest(true)}}>최신 일정 확인</button><button onClick={()=>addPlan({...plan,id:crypto.randomUUID(),title:plan.title.slice(0,90)+' (사본)'})}>새 사본으로 계속 작성</button></div>}
      {(view === 'discover' || view === 'map') && <>
        <section className={`o-intro${spotlight ? ' with-spotlight' : ''}`}><div className="o-intro-copy"><p className="o-overline">가까운 곳에서, 새로운 하루</p><h1 ref={heading} tabIndex={-1}>{addingToPlan ? <>일정에 더할 곳을 찾아요<span className="o-title-dot">.</span></> : <>이번 주말,<br/> 뭐 하고 놀까요<span className="o-title-dot">?</span></>}</h1><p>{addingToPlan ? "마음에 드는 곳을 계속 담고, 일정에서 순서를 조정하세요." : <>팝업부터 동네 축제까지. <br/>우리 취향에 맞는 하루를 찾아보세요.</>}</p>{!addingToPlan && <button className="o-text-button o-browse-courses" onClick={() => { setTemplateIndex(null); setExamples(true) }}>일정 아이디어 둘러보기 <DiscoveryIcon name="arrow" size={17}/></button>}</div>{spotlight && <button className="o-spotlight" onClick={() => setSelected(samples[2])} aria-label="노을 따라 가을마켓 예시 자세히 보기"><img src={samples[2].image} alt=""/><span className="o-spotlight-label">이런 주말은 어때요? · 체험용 예시</span><span className="o-spotlight-copy"><small>성수 · 야외 · 입장 무료</small><strong>산책 끝에 만나는 <br/>작은 가을마켓</strong><span>구경하러 가기 <DiscoveryIcon name="arrow" size={18}/></span></span></button>}</section>
        {addingToPlan && activePlan ? <div className="o-continue"><div><strong>{plan.title}</strong><span>이 일정에 추가할 장소를 찾고 있어요 · {dayLabel(plan.day)}</span></div><button className="o-text-button" onClick={() => openPlanner('edit')}>일정으로 돌아가기 →</button></div> : continuing && <div className="o-continue"><div><span>지난번 만들던 일정</span><strong>{continuing.title}</strong></div><button className="o-text-button" onClick={() => { write({ ...state, activeId: continuing.id }); openPlanner('edit') }}>이어서 만들기 →</button></div>}
        <section className="o-discovery-tools" aria-label="행사 찾기" ref={searchArea}>
          <div className="o-search-row"><label className="o-search"><DiscoveryIcon name="search"/><input aria-label="행사와 동네 검색" value={q} onChange={e => setQ(e.target.value)} placeholder="행사 이름, 동네, 관심사 검색"/>{q && <button className="o-icon-button" aria-label="검색어 지우기" onClick={() => setQ('')}><DiscoveryIcon name="close" size={16}/></button>}</label><label className="o-date"><DiscoveryIcon name="calendar" size={18}/><span>가는 날</span><input type="date" aria-label="둘러볼 날짜" disabled={addingToPlan} value={discoveryDay} onChange={e => { if (validDate(e.target.value)) setBrowseDay(e.target.value) }}/></label><button className="o-filter-trigger" onClick={() => setFiltersOpen(true)}><DiscoveryIcon name="menu" size={18}/>지역·조건{[area, indoor, free].filter(Boolean).length > 0 && <span>{[area, indoor, free].filter(Boolean).length}</span>}</button></div>
          <div className="o-kind-filters" role="group" aria-label="행사 종류">{(['', 'popup', 'exhibition', 'festival'] as const).map(k => <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}><DiscoveryIcon name={k === 'popup' ? 'ticket' : k === 'exhibition' ? 'building' : k === 'festival' ? 'festival' : 'grid'} size={18}/>{k ? kindLabels[k] : '전체'}</button>)}</div>
          {filterCount > 0 && <div className="o-active-filters" aria-label="선택한 검색 조건">{q.trim() && <button onClick={() => setQ('')} aria-label="검색어 조건 해제">“{q.trim()}” ×</button>}{kind && <button onClick={() => setKind('')} aria-label="행사 종류 조건 해제">{kindLabels[kind]} ×</button>}{area && <button onClick={() => setArea('')} aria-label="지역 조건 해제">{area} ×</button>}{indoor && <button onClick={() => setIndoor(false)}>실내 ×</button>}{free && <button onClick={() => setFree(false)}>입장 무료 ×</button>}<button className="o-clear-filters" onClick={resetFilters}>전체 해제</button></div>}
        </section>
        <div className="o-data-bar"><div><span className="o-data-label">{source === 'sample' ? '체험용 예시' : '실제 공개 행사'}</span><p>{source === 'sample' ? '가상 행사 · 실제 방문 안내가 아니에요.' : '공개된 팝업·박람회·축제를 조회해요. 운영시간과 예약 조건은 공식 안내를 확인해 주세요.'}</p></div><select aria-label="행사 데이터 선택" value={source} onChange={e => { setSource(e.target.value as typeof source); resetFilters() }}><option value="sample">예시로 체험</option><option value="catalog">실제 행사 보기</option></select></div>
      </>}
      {view === 'saved' && <section className="o-page-heading"><div><p className="o-overline">나중에 가보고 싶은 곳</p><h1 ref={heading} tabIndex={-1}>우리의 다음 약속</h1><p>모아둔 장소를 골라 하루 일정으로 이어보세요.</p></div><button className="o-button secondary" disabled={legacyBusy} onClick={() => void bringSaved()}>{legacyBusy ? '확인하는 중…' : '기존 기기 보관함 가져오기'}</button></section>}
      {view !== 'plans' ? <div className={`o-discovery-layout${view === 'map' ? ' map-mode' : ''}`}>
        <section className="o-results"><div className="o-section-heading"><div><p className="o-results-eyebrow">{view === 'saved' ? '천천히 모아두세요' : `${dayLabel(discoveryDay)} · ${area || '모든 지역'}`}</p><h2 aria-live="polite">{view === 'saved' ? `저장한 장소 ${state.saved.length}` : filterCount ? `조건에 맞는 ${filtered.length}곳` : '어디가 끌리세요?'}{!filterCount && view !== 'saved' && <span className="o-result-count">{filtered.length}</span>}</h2></div><div className="o-result-tools"><select aria-label="행사 정렬" value={sort} onChange={e => setSort(e.target.value)}><option value="default">기본 순</option><option value="cost">비용 낮은 순</option><option value="duration">짧게 둘러보기</option></select>{view !== 'saved' && <button className="o-text-button" onClick={() => navigate(view === 'map' ? 'discover' : 'map', addingToPlan)}><DiscoveryIcon name={view === 'map' ? 'grid' : 'pin'} size={16}/>{view === 'map' ? '목록' : '지도'}</button>}</div></div>
          {view === 'saved' && <label className="o-search o-saved-search"><DiscoveryIcon name="search"/><input aria-label="보관함 검색" placeholder="저장한 장소 찾기" value={q} onChange={e => setQ(e.target.value)}/>{q && <button className="o-icon-button" aria-label="보관함 검색어 지우기" onClick={() => setQ('')}><DiscoveryIcon name="close" size={16}/></button>}</label>}
          {view === 'map' && <PlaceMap places={filtered} selected={selected?.id} onSelect={setSelected}/>}
          {view !== 'saved' && loading && source === 'catalog' ? <div className="o-loading" role="status">공개 행사를 불러오고 있어요…</div> : view !== 'saved' && loadError && source === 'catalog' ? <div className="o-empty" role="alert"><h3>{loadError}</h3><button className="o-button secondary" onClick={() => void catalogResult.reload()}>다시 불러오기</button></div> : filtered.length ? <div className="o-card-grid">{ordered.map(place => <PlaceCard key={place.id} place={place} day={discoveryDay} addLabel="일정에 담기" saved={state.saved.some(p => p.id === place.id)} added={appending && plan.stops.some(s => s.place.id === place.id)} onOpen={() => setSelected(place)} onSave={() => savePlace(place)} onAdd={() => addPlace(place)}/>)}</div> : <div className="o-empty"><DiscoveryIcon name={view === 'saved' ? 'bookmark' : 'search'} size={36}/><h3>{view === 'saved' ? state.saved.length ? '검색한 장소가 없어요' : '마음에 드는 곳부터 모아보세요' : '이 조건에 맞는 장소가 아직 없어요'}</h3><p>{view === 'saved' ? state.saved.length ? '검색어를 바꾸거나 지워보세요.' : '행사 카드의 보관 버튼을 누르면 여기에 모여요.' : '동네나 날짜를 바꾸면 다른 장소를 만날 수 있어요.'}</p><button className="o-button secondary" onClick={() => { resetFilters(); if (view === 'saved' && !state.saved.length) navigate('discover') }}>{view === 'saved' && !state.saved.length ? '행사 둘러보기' : '검색 조건 초기화'}</button></div>}
          {limited && source === 'catalog' && <p className="o-helper">공개 행사가 많아 분야별 첫 1,000개를 조회했어요.</p>}
        </section>
      </div> : !account.ready ? <p role="status">계정 일정을 확인하고 있어요…</p> : <PlannerWorkspace plans={state.plans} plan={plan} stage={stage} places={allPlaces} saved={state.saved} source={source} savedAt={savedAt} canUndo={canUndo} account={member} busy={account.busy} dirtyIds={account.dirtyIds} savedIds={account.savedIds} save={()=>void saveAccount()}
        select={(id, next) => { write({ ...state, activeId: id }); openPlanner(next) }} changeStage={openPlanner} create={() => addPlan(newPlan(browseDay))}
        patch={patchPlan} update={updateStop} add={addPlace} move={stopProps.move} remove={removeStop} open={setSelected}
        discover={index => { setInsertionIndex(index); resetFilters(); navigate('discover', true) }} custom={index => { setInsertionIndex(index); setCustom(true) }}
        undo={undo} share={openShare} importFile={() => file.current?.click()} exportFile={exportFile}
        duplicate={() => addPlan({ ...plan, id: crypto.randomUUID(), title: plan.title.slice(0, 90) + ' (복사)', stops: plan.stops.map(s => ({ ...s, id: crypto.randomUUID() })) })}
        deletePlan={() => setDeleting(true)}/>
      }
      {view === 'discover' && source === 'sample' && !filterCount && !addingToPlan && <section className="o-course-shelf"><div className="o-section-heading"><div><p className="o-results-eyebrow">장소 하나에서 하루의 아이디어로</p><h2>이렇게 이어가도 좋아요</h2></div><span className="o-tag">예시 일정</span></div><div className="o-course-grid">{templates.map((t, i) => <button key={t.title} onClick={() => { setTemplateIndex(i); setExamples(true) }}><img src={t.photo} alt="" loading="lazy"/><span><small>{t.tag}</small><strong>{t.title}</strong><span>{t.detail}</span><b>일정 구경하기 →</b></span></button>)}</div></section>}
    </main>
    {addingToPlan && activePlan && view !== 'plans' && <div className="p-browse-basket"><label>담고 있는 일정<select aria-label="담고 있는 일정" value={plan.id} onChange={e => { write({ ...state, activeId: e.target.value }); setInsertionIndex(null) }}>{state.plans.map(p => <option key={p.id} value={p.id}>{p.title} · {dayLabel(p.day)}</option>)}</select></label><span aria-live="polite">{plan.stops.length}곳 담음</span><button className="o-button" onClick={() => openPlanner('edit')}>일정 보기 →</button><button className="o-text-button" onClick={() => { setAddingToPlan(false); setInsertionIndex(null) }}>담기 마치기</button></div>}
    <OutingsFooter onNavigate={next => { resetFilters(); navigate(next) }}/>
    {message && <div className="o-toast" role="status"><span>{message}</span>{canUndo && <button onClick={() => { undo(); setMessage('이전 상태로 되돌렸어요.') }}>되돌리기</button>}<button className="o-icon-button" aria-label="알림 닫기" onClick={() => setMessage('')}><DiscoveryIcon name="close" size={16}/></button></div>}
    <nav className="o-mobile-nav" aria-label="모바일 주 메뉴">{nav.map(n => <button key={n.id} aria-current={view === n.id ? 'page' : undefined} onClick={() => { resetFilters(); navigate(n.id) }}><DiscoveryIcon name={n.icon} size={21}/><span>{n.label}{n.id === 'plans' && state.plans.length > 0 ? ` ${state.plans.length}` : ''}</span></button>)}</nav>
    {filtersOpen && <Modal title="어떤 곳을 찾으세요?" close={() => setFiltersOpen(false)}><div className="o-dialog-body o-filter-body"><section><h3>언제 갈까요?</h3><div className="o-inline"><button className="o-small-button" disabled={addingToPlan} aria-pressed={discoveryDay === today()} onClick={() => setBrowseDay(today())}>오늘</button><button className="o-small-button" disabled={addingToPlan} aria-pressed={discoveryDay === weekend()} onClick={() => setBrowseDay(weekend())}>이번 주말</button><span className="o-helper">{dayLabel(discoveryDay)}</span></div>{addingToPlan && <p className="o-helper">작성 중인 일정의 날짜로 찾고 있어요.</p>}</section><section><h3>어느 지역이 좋아요?</h3><div className="o-area-row" role="group" aria-label="동네"><button aria-pressed={!area} onClick={() => setArea('')}>모든 지역</button>{areas.map(a => <button key={a} aria-pressed={area === a} onClick={() => setArea(a)}>{a}</button>)}</div></section><section><h3>원하는 조건</h3><label className="o-check-chip"><input type="checkbox" checked={indoor} onChange={e => setIndoor(e.target.checked)}/>실내에서 즐기기</label><label className="o-check-chip"><input type="checkbox" checked={free} onChange={e => setFree(e.target.checked)}/>입장료 없이 가기</label>{source === 'catalog' && <p className="o-helper">실내 여부와 입장료가 확인된 행사만 해당 조건에 표시돼요. 현재 공개 데이터에는 이 정보가 부족해요.</p>}</section><div className="o-dialog-actions"><button className="o-text-button" onClick={resetFilters}>조건 초기화</button><button className="o-button" onClick={() => setFiltersOpen(false)}>{filtered.length}곳 보기</button></div></div></Modal>}
    {selected && <PlaceDetail place={selected} day={view === "plans" ? plan.day : discoveryDay} addLabel="일정에 담기" saved={state.saved.some(p => p.id === selected.id)} added={appending && plan.stops.some(s => s.place.id === selected.id)} onAdd={() => addPlace(selected)} onSave={() => savePlace(selected)} close={() => setSelected(null)}/>}
    {pendingPlace && <Modal title="어느 일정에 담을까요?" close={() => setPendingPlace(null)}><div className="o-dialog-body p-targets"><p>{pendingPlace.name}</p>{state.plans.map(p => <button className="o-button secondary" key={p.id} disabled={p.stops.length >= 30 || p.stops.some(s => s.place.id === pendingPlace.id) || availability(pendingPlace, p.day) === 'closed'} onClick={() => { const next = insertStop(p, pendingPlace); write({ ...state, activeId: p.id, plans: state.plans.map(old => old.id === p.id ? { ...next, updatedAt: new Date().toISOString() } : old) }); setAddingToPlan(true); setInsertionIndex(null); setPendingPlace(null); setMessage('일정에 담았어요. 계속 골라보세요.') }}>{p.title} · {dayLabel(p.day)}{p.stops.some(s => s.place.id === pendingPlace.id) ? ' · 이미 담음' : availability(pendingPlace, p.day) === 'closed' ? ' · 운영일 다름' : ''}</button>)}<button className="o-button" disabled={state.plans.length >= 50} onClick={() => startWith(pendingPlace)}>+ 새 일정에 담기</button></div></Modal>}
    {custom && <CustomPlaceForm add={addPlace} close={() => setCustom(false)}/>}
    {examples && <Modal title={templateIndex === null ? '이런 하루는 어때요?' : templates[templateIndex].title} close={() => { setExamples(false); setTemplateIndex(null) }} wide><div className="o-dialog-body">{templateIndex === null ? <><p className="o-helper">가상 장소로 구성한 예시 일정이에요. 먼저 구경하고 마음에 들면 내 일정으로 가져오세요.</p><div className="o-template-list">{templates.map((t, i) => <button key={t.title} onClick={() => setTemplateIndex(i)}><img src={t.photo} alt=""/><span><small>{t.tag} · 예시</small><strong>{t.title}</strong><span>{t.detail}</span></span><span>→</span></button>)}</div></> : <><p className="o-helper">{templates[templateIndex].detail} · 체험용 예시</p><ol className="o-course-stops">{templates[templateIndex].ids.map(id => { const place = samples.find(p => p.id === id)!; return <li key={id}><strong>{place.name}</strong><span>{kindLabels[place.kind]} · {place.duration}분</span><p>{place.description}</p></li> })}</ol><button className="o-button full" onClick={() => chooseTemplate(templateIndex)}>이 일정으로 내 일정 시작하기</button><button className="o-text-button full" onClick={() => setTemplateIndex(null)}>다른 일정 둘러보기</button></>}</div></Modal>}
    {share && sharePlan && <ShareDialog key={account.owner} plan={sharePlan} owner={account.owner} close={()=>setShare(false)}/>}
    {deleting&&<Modal title="이 일정을 삭제할까요?" close={()=>setDeleting(false)}><div className="o-dialog-body"><p>{plan.title}</p><p>{account.savedIds.includes(plan.id)?'계정에 저장한 일정도 삭제됩니다. 다른 기기에서도 삭제되며 되돌릴 수 없습니다.':'이 기기에 작성한 초안을 삭제합니다.'}</p><button className="o-button secondary" onClick={()=>setDeleting(false)}>취소</button><button className="o-button" disabled={account.busy} onClick={()=>void account.store.remove(plan.id).then(()=>{setDeleting(false);openPlanner('list');setMessage('일정을 삭제했어요.')}).catch(e=>setMessage(e instanceof Error?e.message:'삭제하지 못했어요.'))}>삭제</button></div></Modal>}
    {latest&&<Modal title="최신 계정 일정 확인" close={()=>setLatest(false)}><div className="o-dialog-body"><p>현재 초안을 파일로 보관할 수 있어요. 아래 버튼은 작성 중인 초안을 버리고 최신 계정 내용으로 바꿉니다.</p><button className="o-button secondary" onClick={exportFile}>현재 초안 파일로 보관</button><button className="o-button" disabled={!account.ready||account.busy} onClick={()=>{account.store.useLatest(plan.id);setLatest(false)}}>최신 계정 일정으로 바꾸기</button></div></Modal>}

    <input hidden ref={file} type="file" accept="application/json,.json" onChange={async e => { const chosen = e.target.files?.[0]; e.target.value = ''; if (!chosen) return; try { if (chosen.size > 300000) throw Error('일정 파일은 300KB 이하만 가져올 수 있어요.'); const incoming = importPlan(await chosen.text()); addPlan({...incoming,id:crypto.randomUUID()}); setMessage('파일의 일정을 새 일정으로 가져왔어요.') } catch (err) { setMessage(err instanceof Error ? err.message : '파일을 읽을 수 없어요.') } }}/>
  </div>
}
