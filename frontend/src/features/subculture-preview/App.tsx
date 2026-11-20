import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ComponentProps, FormEvent, ReactNode } from 'react'
import { Link as RouterLink, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useNavigationType, useParams, useSearchParams } from 'react-router'
import { DiscoveryIcon as Icon } from '../discovery/DiscoveryIcon'
import { base, creators, dayLabel, events, goods, initialState, notices, priceLabel, storageKey, subjects } from './data'
import type { Event, Good, PreviewState } from './data'
import { CharacterPortrait } from './DiscoveryHero'
import { artworks, creatorHasSubject, CurationDetail, EditorialArtwork } from './editorial'
import { EventGuide } from './EventGuide'
import { InterestSetup } from './InterestSetup'
import { BrandLogo } from './BrandLogo'
import { HomeDiscovery, homeCases, makeHomeCase } from './HomeDiscovery'
import type { HomeCase } from './HomeDiscovery'
import { catalogWorks, interestDefaults, selectedInterestWorks, subjectWorkId } from './interests'

type PreviewContextValue = {
  state: PreviewState; update: (fn: (state: PreviewState) => PreviewState) => void;
  follow: (id: string) => void; save: (good: Good, day?: string) => void; toast: (message: string, undo?: () => void) => void;
}
const PreviewContext = createContext<PreviewContextValue | null>(null)
function usePreview() { const value = useContext(PreviewContext); if (!value) throw new Error('Preview context missing'); return value }
function Link(props:ComponentProps<typeof RouterLink>) {
  const location=useLocation()
  return <RouterLink {...props} state={props.state ?? {from:location.pathname+location.search}}/>
}
function readState(): PreviewState {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || 'null') as PreviewState | null
    if (value && Array.isArray(value.follows) && value.follows.every(x => typeof x === 'string') && Array.isArray(value.read) && value.read.every(x => typeof x === 'string') && Array.isArray(value.saved) && value.saved.every(x => x && goods.some(g => g.id === x.goodId) && typeof x.day === 'string' && typeof x.note === 'string' && typeof x.done === 'boolean') && Array.isArray(value.reviews) && value.reviews.every(x => x && typeof x.body === 'string' && typeof x.edition === 'string' && typeof x.eventId === 'string') && typeof value.push === 'boolean') return { ...value, ...interestDefaults(value) }
  } catch { /* Storage may be disabled. The preview remains usable in memory. */ }
  return structuredClone(initialState)
}

export function SubculturePreview() {
  const [state, setState] = useState(readState)
  const [message, setMessage] = useState('')
  const [undoAction,setUndoAction]=useState<(()=>void)|null>(null)
  const toast:PreviewContextValue['toast']=(text,undo)=>{setMessage(text);setUndoAction(()=>undo || null)}
  const [saveTarget, setSaveTarget] = useState<{ good: Good; day: string } | null>(null)
  const main = useRef<HTMLElement>(null)
  const lastPath = useRef('')
  const location = useLocation()
  const navigationType=useNavigationType(), scrollPositions=useRef(new Map<string,number>())
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(state)) } catch { /* In-memory fallback. */ }
  }, [state])
  useLayoutEffect(() => {
    if(navigationType==='POP') window.scrollTo(0,scrollPositions.current.get(location.key) || 0)
    else if(lastPath.current && lastPath.current!==location.pathname) window.scrollTo(0,0)
    if(lastPath.current && lastPath.current!==location.pathname) main.current?.focus({preventScroll:true})
    lastPath.current = location.pathname
    document.title = '부스하나 서브컬처 · 화면 미리보기'
    const remember=()=>scrollPositions.current.set(location.key,window.scrollY)
    window.addEventListener('scroll',remember,{passive:true})
    return ()=>window.removeEventListener('scroll',remember)
  }, [location.key,location.pathname,navigationType])
  useEffect(() => { if (!message || undoAction) return; const timer = window.setTimeout(() => setMessage(''), 4200); return () => clearTimeout(timer) }, [message,undoAction])
  const follow = (id: string) => {
    const active = state.follows.includes(id)
    setState(s => ({ ...s, follows: active ? s.follows.filter(x => x !== id) : [...s.follows, id] }))
    toast(active ? '관심에서 해제했어요.' : '관심에 추가했어요.',active?()=>setState(s=>({...s,follows:[...new Set([...s.follows,id])]})):undefined)
  }
  const unread = notices.filter(n => !state.read.includes(n.id)).length
  return <PreviewContext.Provider value={{ state, update: setState, follow, save: (good, day = '') => setSaveTarget({ good, day }), toast }}>
    <div className="sc-app">
      <a className="sc-skip" href="#sc-main" onClick={e => { e.preventDefault(); main.current?.focus(); main.current?.scrollIntoView({ block: 'start' }) }}>본문으로 바로가기</a>
      <div className="sc-preview-bar"><span className="sc-preview-dot" />화면 미리보기 <span className="sc-preview-explain">· 행사·작가·상품은 예시이며, 변경은 이 브라우저에만 저장돼요.</span><Link to="/account">미리보기 안내</Link></div>
      <header className="sc-header"><div className="sc-container sc-header-inner">
        <Link className="sc-brand" to="/" aria-label="부스하나 서브컬처 홈"><BrandLogo/></Link>
        <nav className="sc-desktop-nav" aria-label="서브컬처 탐색"><NavLink to="/" end>발견</NavLink><NavLink to="/subjects">캐릭터 탐색</NavLink><NavLink to="/creators">작가·서클</NavLink><NavLink to="/events">행사 찾기</NavLink></nav>
        <div className="sc-header-actions"><NavLink to="/explore" aria-label="캐릭터·작가 검색"><Icon name="search" size={20}/></NavLink><NavLink to="/notifications" className="sc-notification-link" aria-label={`알림${unread ? ` ${unread}개 안 읽음` : ''}`}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg><span className="sc-desktop-label">알림</span>{unread > 0 && <b>{unread}</b>}</NavLink><NavLink to="/visits" className="sc-desktop-label"><Icon name="bookmark" size={19}/>내 방문</NavLink><NavLink to="/account" className="sc-account-link" aria-label="내 정보">나</NavLink></div>
      </div></header>
      <main id="sc-main" ref={main} tabIndex={-1} className="sc-container sc-main">
        <Routes>
          <Route path="/" element={state.onboardingStatus === 'new' && !new URLSearchParams(location.search).has('homeCase') ? <Navigate to="/onboarding" replace/> : <Home/>}/>
          <Route path="/onboarding" element={<InterestPage onboarding/>}/>
          <Route path="/account/interests" element={<InterestPage/>}/>
          <Route path="/collections/:id" element={<CollectionPage/>}/>
          <Route path="/explore" element={<Explore/>}/>
          <Route path="/events" element={<Explore fixed="events"/>}/>
          <Route path="/subjects" element={<Explore fixed="subjects"/>}/>
          <Route path="/creators" element={<Explore fixed="creators"/>}/>
          <Route path="/goods" element={<Explore fixed="goods"/>}/>
          <Route path="/subjects/:id" element={<SubjectDetail/>}/>
          <Route path="/creators/:id" element={<CreatorDetail/>}/>
          <Route path="/goods/:id" element={<GoodDetail/>}/>
          <Route path="/booths/:creatorId/:eventId" element={<BoothDetail/>}/>
          <Route path="/events/:id" element={<EventDetail/>}/>
          <Route path="/notifications" element={<Notifications/>}/>
          <Route path="/visits" element={<Visits/>}/>
          <Route path="/following" element={<Following/>}/>
          <Route path="/account" element={<Account/>}/>
          <Route path="*" element={<Empty title="페이지를 찾을 수 없어요" body="홈에서 원하는 캐릭터나 행사를 다시 찾아보세요."/>}/>
        </Routes>
      </main>
      <footer className="sc-footer"><div className="sc-container"><div className="sc-footer-top"><div><Link to="/" className="sc-footer-logo" aria-label="부스하나 서브컬처 홈"><BrandLogo/></Link><p>좋아하는 것을 발견하고, 직접 만나는 곳.</p></div><nav aria-label="다른 분야 사이트"><span>다른 부스하나 둘러보기</span><a href="https://expo.boothana.kr/" target="_blank" rel="noreferrer">박람회 ↗</a><a href="https://festival.boothana.kr/" target="_blank" rel="noreferrer">축제·행사 ↗</a></nav></div><div className="sc-footer-bottom"><span>© BoothHana · 서브컬처 화면 제안</span><span>이 화면의 일정·가격·참가 정보는 실제 방문에 사용할 수 없는 예시예요.</span></div></div></footer>
      <nav className="sc-mobile-nav" aria-label="주요 메뉴"><NavLink to="/" end><Icon name="grid"/><span>홈</span></NavLink><NavLink to="/explore" className={()=>/^\/(explore|subjects|creators|events|goods|booths|collections)(\/|$)/.test(location.pathname)?'active':''}><Icon name="search"/><span>탐색</span></NavLink><NavLink to="/visits"><Icon name="bookmark"/><span>내 방문</span></NavLink><NavLink to="/account" className={()=>/^\/(account|following|onboarding)(\/|$)/.test(location.pathname)?'active':''}><Icon name="menu"/><span>마이</span></NavLink></nav>
      <div className={`sc-toast${message ? ' is-visible' : ''}`} role="status">{message && <><span>{message}</span>{undoAction&&<><button onClick={()=>{undoAction();toast('되돌렸어요.')}}>실행 취소</button><button aria-label="알림 닫기" onClick={()=>{setMessage('');setUndoAction(null)}}><Icon name="close" size={17}/></button></>}</>}</div>
      {saveTarget && <SaveDialog good={saveTarget.good} preferredDay={saveTarget.day} close={() => setSaveTarget(null)}/>}
    </div>
  </PreviewContext.Provider>
}

function SectionTitle({ title, note, to, link = '전체 보기' }: { title: string; note?: string; to?: string; link?: string }) {
  return <div className="sc-section-title"><div><h2>{title}</h2>{note && <p>{note}</p>}</div>{to && <Link to={to}>{link}<Icon name="arrow" size={17}/></Link>}</div>
}
function PageTitle({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) { return <div className="sc-page-title"><span className="sc-eyebrow">{eyebrow}</span><h1>{title}</h1>{body&&<p>{body}</p>}</div> }
function BackLink({ to, children }: { to: string; children: ReactNode }) {
  const location=useLocation(),navigate=useNavigate(),from=location.state?.from
  const internal=typeof from==='string'&&from.startsWith('/')&&!from.startsWith('//')
  return <RouterLink className="sc-back" to={internal?from:to} onClick={internal?e=>{if(e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();navigate(-1)}:undefined}><span aria-hidden="true">←</span>{internal?'이전 화면':children}</RouterLink>
}
function Empty({ title, body, to = '/explore', action = '둘러보기' }: { title: string; body: string; to?: string; action?: string }) {
  return <div className="sc-empty"><Icon name="search" size={28}/><h2>{title}</h2><p>{body}</p><Link className="sc-button" to={to}>{action}<Icon name="arrow" size={17}/></Link></div>
}
function FollowButton({ id, small = false }: { id: string; small?: boolean }) {
  const { state, follow } = usePreview(), active = state.follows.includes(id)
  const [type, target] = id.split(':'), name = type === 'subject' ? subjects.find(s => s.id === target)?.name : type==='custom'?state.customCharacters.find(c=>c.id===target)?.name:creators.find(c => c.id === target)?.name
  return <button className={`sc-follow sc-heart-toggle${active ? ' is-active' : ''}${small ? ' is-small' : ''}`} title={active?'관심 해제':'관심 등록'} aria-label={`${name} ${active ? '관심 해제' : '관심 등록'}`} aria-pressed={active} onClick={e=>{const button=e.currentTarget;follow(id);requestAnimationFrame(()=>{if(!button.isConnected)document.querySelector<HTMLButtonElement>('.sc-toast button')?.focus({preventScroll:true})})}}><svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true"><path d="M20.8 4.7a5.5 5.5 0 0 0-7.8 0L12 5.8l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.5a5.5 5.5 0 0 0 0-7.8Z"/></svg></button>
}
function SearchBox({ initial = '', kind = 'all' }: { initial?: string; kind?: string }) {
  const [query, setQuery] = useState(initial), navigate = useNavigate()
  const [params] = useSearchParams()
  useEffect(() => setQuery(initial), [initial])
  const submit = (e: FormEvent) => { e.preventDefault(); const next = new URLSearchParams(params); next.set('q', query.trim()); next.set('kind', kind); navigate(`/explore?${next}`) }
  const placeholder=kind==='subjects'?'작품 또는 캐릭터 이름':kind==='creators'?'작가·서클 또는 캐릭터 이름':kind==='events'?'행사·지역 또는 캐릭터 이름':kind==='goods'?'굿즈·작가 또는 캐릭터 이름':'캐릭터, 작품, 작가, 행사 이름'
  return <><label className="sc-search-label" htmlFor="sc-catalog-search">{kind==='all'?'통합 검색':'이름으로 찾기'}</label><form className="sc-search" role="search" onSubmit={submit}><Icon name="search" size={23}/><input id="sc-catalog-search" aria-label="작품, 캐릭터, 작가, 굿즈, 행사 통합검색" placeholder={placeholder} value={query} maxLength={100} onChange={e => setQuery(e.target.value)}/>{query && <button type="button" className="sc-icon-button" aria-label="검색어 지우기" onClick={() => {setQuery('');const next=new URLSearchParams(params);next.delete('q');next.set('kind',kind);navigate('/explore?'+next)}}><Icon name="close" size={18}/></button>}<button type="submit">검색</button></form></>
}
function InterestPage({ onboarding = false }: { onboarding?: boolean }) {
  const { state, update, toast } = usePreview()
  return <InterestSetup state={state} update={update} toast={toast} onboarding={onboarding}/>
}
function InterestSummary() {
  const { state } = usePreview()
  const allWorks = [...catalogWorks,...state.customWorks], ids = selectedInterestWorks(state)
  return <section className="sc-account-interests"><div className="sc-section-title"><div><h2>나의 관심 작품·캐릭터</h2><p>작품과 캐릭터를 고르거나 직접 입력할 수 있어요.</p></div><Link to="/account/interests">설정·수정 <Icon name="chevron" size={16}/></Link></div>
    {ids.length ? ids.map(id=>{const w=allWorks.find(w=>w.id===id); if(!w)return null;const known=subjects.filter(s=>subjectWorkId(s.id)===id && state.follows.includes('subject:'+s.id)),custom=state.customCharacters.filter(c=>c.workId===id && state.follows.includes('custom:'+c.id));return <div className="sc-account-work" key={id}><small>{w.kind}{id.startsWith('custom-work:')?' · 직접 입력':''}</small><h3>{w.title}</h3><div>{known.map(s=><Link key={s.id} to={'/subjects/'+s.id}>{s.name} <Icon name="chevron" size={13}/></Link>)}{custom.map(c=><Link key={c.id} to="/account/interests">{c.name}<small>소식 연결 대기</small></Link>)}</div>{!known.length&&!custom.length&&<p>작품 전체에 관심 있어요.</p>}</div>}) : <div className="sc-setup-empty"><p>좋아하는 작품과 캐릭터를 알려주세요.</p><Link className="sc-button sc-primary" to="/account/interests">관심 설정하기</Link></div>}
    </section>
}
function CollectionPage() {
  const { pathname } = useLocation()
  return <CurationDetail key={pathname} followButton={id => <FollowButton id={id} small/>} creatorCard={id => <CreatorCard creator={creators.find(c => c.id === id)!}/>} eventCard={id => <EventCard event={events.find(e => e.id === id)!}/>}/>
}
function Home() {
  const actual=usePreview(), [params]=useSearchParams()
  const selected=homeCases.find(c=>c.id===params.get('homeCase'))
  const [drafts,setDrafts]=useState<Partial<Record<HomeCase,PreviewState>>>({})
  const state=selected?(drafts[selected.id] || makeHomeCase(actual.state,selected.id)):actual.state
  const update:PreviewContextValue['update']=fn=>{if(selected)setDrafts(s=>({...s,[selected.id]:fn(s[selected.id] || makeHomeCase(actual.state,selected.id))}));else actual.update(fn)}
  const follow=(id:string)=>{if(!selected){actual.follow(id);return}update(s=>({...s,follows:s.follows.includes(id)?s.follows.filter(x=>x!==id):[...s.follows,id]}));actual.toast('이 사례 화면에만 반영했어요. 내 관심 설정은 유지돼요.')}
  return <PreviewContext.Provider value={{...actual,state,update,follow}}><HomeContent key={selected?.id || 'actual'}/></PreviewContext.Provider>
}
function HomeContent() {
  const {state,follow}=usePreview()
  return <HomeDiscovery state={state} follow={follow} goodCard={good=><GoodCard good={good}/>} creatorCard={creator=><CreatorCard creator={creator}/>}/>
}
function EventArt({ event, large = false }: { event: Event; large?: boolean }) {
  return <div className={`sc-event-art ${event.color}${large ? ' is-large' : ''}`}><span className="sc-poster-edition">{event.edition} <Icon name="sparkles" size={19}/></span><strong>{event.english.split('\n').map(line => <span key={line}>{line}</span>)}</strong><div className="sc-poster-circle" aria-hidden="true"/><span className="sc-poster-date">{event.label}<span>2026</span></span></div>
}
function EventCard({ event }: { event: Event }) {
  const count = goods.filter(g => g.event === event.id).length
  return <article className="sc-event-card"><Link to={'/events/'+event.id}><EventArt event={event}/><div className="sc-event-card-info"><span className="sc-meta">{event.type}</span><h3>{event.name}</h3><strong>{event.label}</strong><p><Icon name="pin" size={14}/>{event.place}</p><span className={'sc-badge '+(count ? 'confirmed' : '')}>{count ? `판매 확인 굿즈 ${count}개` : '캐릭터 테마 · 판매표 미공개'}</span></div></Link></article>
}
function GoodCard({ good, preferredDay = '' }: { good: Good; preferredDay?: string }) {
  const { state, save } = usePreview(), saved = state.saved.some(s => s.goodId === good.id)
  const path = '/goods/'+good.id+(preferredDay ? '?day='+preferredDay : '')
  return <article className="sc-good-card"><div className="sc-good-image"><Link to={path}><img src={base+good.image} alt={good.name} loading="lazy"/></Link><button className={'sc-save-icon'+(saved ? ' is-saved' : '')} onClick={() => save(good, preferredDay)} aria-label={`${good.name} ${saved ? '저장된 방문일 확인' : '저장'}`}><Icon name={saved ? 'check' : 'bookmark'} size={19}/></button></div><div className="sc-good-info"><Link className="sc-meta" to={'/creators/'+good.creator}>{creators.find(c => c.id === good.creator)?.name}</Link><h3><Link to={path}>{good.name}</Link></h3><strong className="sc-price">{priceLabel(good.price)}</strong><p className={good.event ? 'sc-confirmed' : 'sc-muted'}><Icon name={good.event ? 'check' : 'info'} size={14}/>{good.event ? '이번 행사 판매 확인' : '이번 행사 판매 미확인'}</p></div></article>
}
function CreatorCard({ creator: c }: { creator: typeof creators[number] }) {
  return <article className="sc-creator-card"><Link className="sc-creator-portfolio" to={'/creators/'+c.id} aria-label={c.name+' 대표작 보기'}>{artworks.filter(a=>a.creator===c.id).slice(0,2).map(a=><EditorialArtwork key={a.id} art={a}/>)}</Link><div className="sc-creator-heading"><Link to={'/creators/'+c.id} className={'sc-avatar '+c.color}>{c.initials}</Link><div><h3><Link to={'/creators/'+c.id}>{c.name}</Link></h3><span className="sc-meta">{c.tags}</span></div></div><p>{c.bio}</p><div className="sc-card-bottom"><Link to={'/creators/'+c.id}>작가 둘러보기 <Icon name="arrow" size={15}/></Link><FollowButton id={'creator:'+c.id} small/></div></article>
}
function SubjectCard({ subject: s }: { subject: typeof subjects[number] }) {
  return <article className="sc-subject-card"><Link to={'/subjects/'+s.id}><CharacterPortrait id={s.id}/><span className="sc-meta">{s.work}</span><h3>{s.name}</h3></Link><FollowButton id={'subject:'+s.id}/></article>
}

const kinds = [{ id: 'all', label: '전체' }, { id: 'events', label: '행사' }, { id: 'subjects', label: '작품·캐릭터' }, { id: 'creators', label: '작가·서클' }, { id: 'goods', label: '굿즈' }]
function Explore({ fixed }: { fixed?: string }) {
  const [params, setParams] = useSearchParams(), q = (params.get('q') || '').trim(), kind = fixed || params.get('kind') || 'all', region = (kind==='events'||kind==='goods') ? params.get('region') || '' : ''
  const match = (text: string) => text.replaceAll(' ', '').toLowerCase().includes(q.replaceAll(' ', '').toLowerCase())
  const ss = subjects.filter(s => match(s.name+' '+s.work+' '+s.aliases))
  const directCreators = creators.filter(c => match(c.name+' '+c.tags))
  const cs = creators.filter(c => directCreators.includes(c) || ss.some(s => creatorHasSubject(c.id, s.id)))
  const gs = goods.filter(g => (match(g.name+' '+g.kind) || directCreators.some(c => c.id === g.creator) || ss.some(s => s.id === g.subject)) && (!region || events.find(e => e.id === g.event)?.region === region))
  const es = events.filter(e => (!region || e.region === region) && (match(e.name+' '+e.type+' '+e.place) || goods.some(g => g.event === e.id && gs.includes(g)) || (e.id === 'moonfest' && (ss.some(s => s.work === '달빛 우체국') || directCreators.some(c => c.id === 'moon')))))
  const count = (kind === 'all' || kind === 'subjects' ? ss.length : 0) + (kind === 'all' || kind === 'creators' ? cs.length : 0) + (kind === 'all' || kind === 'goods' ? gs.length : 0) + (kind === 'all' || kind === 'events' ? es.length : 0)
  const title = fixed ? kinds.find(k => k.id === fixed)?.label || '탐색' : q ? `‘${q}’ 검색 결과` : '좋아하는 것을 찾아보세요'
  return <><PageTitle eyebrow="DISCOVER YOUR FAVORITES" title={title}/><SearchBox initial={q} kind={kind}/><div className="sc-filter-bar"><nav className="sc-filter-tabs" aria-label="탐색 대상">{kinds.map(k => <Link key={k.id} className={kind === k.id ? 'is-active' : ''} aria-current={kind === k.id ? 'page' : undefined} to={`/explore?kind=${k.id}${q ? '&q='+encodeURIComponent(q) : ''}${region ? '&region='+encodeURIComponent(region) : ''}`}>{k.label}</Link>)}</nav>{(kind === 'events' || kind === 'goods') && <label className="sc-region-filter">행사 지역<select value={region} onChange={e => { const next = new URLSearchParams(params); if (e.target.value) next.set('region', e.target.value); else next.delete('region'); setParams(next) }}><option value="">전체 지역</option><option>서울</option><option>경기</option></select></label>}</div><p className="sc-results-summary">{count}개의 결과 <span>· 예시 데이터 기준{region && ' · 지역은 행사·판매 정보에 적용'}</span></p>
    {!count && <Empty title="조건에 맞는 결과를 찾지 못했어요" body="루나, 달작업실, 키링으로 검색해보세요. 결과가 없다고 실제 판매가 없다는 뜻은 아니에요." to="/explore" action="검색 조건 초기화"/>}
    {(kind === 'all' || kind === 'subjects') && ss.length > 0 && <section className="sc-section">{kind === 'all' && <SectionTitle title="작품·캐릭터"/>}<div className="sc-subject-grid">{ss.map(s => <SubjectCard key={s.id} subject={s}/>)}</div></section>}
    {(kind === 'all' || kind === 'creators') && cs.length > 0 && <section className="sc-section">{kind === 'all' && <SectionTitle title="작가·서클"/>}<div className="sc-creators-grid">{cs.map(c => <CreatorCard key={c.id} creator={c}/>)}</div></section>}
    {(kind === 'all' || kind === 'goods') && gs.length > 0 && <section className="sc-section">{kind === 'all' && <SectionTitle title="굿즈"/>}<div className="sc-goods-grid is-four">{gs.map(g => <GoodCard key={g.id} good={g}/>)}</div></section>}
    {(kind === 'all' || kind === 'events') && es.length > 0 && <section className="sc-section"><SectionTitle title="관련 행사" note={q ? '판매 정보, 작가 참가 공지 또는 캐릭터 테마로 연결된 행사예요.' : undefined}/><div className="sc-event-grid">{es.map(e => <EventCard key={e.id} event={e}/>)}</div></section>}
  </>
}
function SubjectDetail() {
  const { id } = useParams(), s = subjects.find(s => s.id === id)
  if (!s) return <Empty title="캐릭터를 찾지 못했어요" body="캐릭터 목록에서 다시 선택해주세요." to="/subjects"/>
  const related = goods.filter(g => g.subject === s.id), relatedEvents = events.filter(e => related.some(g => g.event === e.id) || (s.work === '달빛 우체국' && e.id === 'moonfest'))
  return <><BackLink to="/subjects">작품·캐릭터</BackLink><section className="sc-identity-hero"><CharacterPortrait id={s.id}/><div><span className="sc-eyebrow">{s.work} · 캐릭터</span><h1>{s.name}</h1><p>{s.description}</p><FollowButton id={'subject:'+s.id}/></div></section><section className="sc-section"><SectionTitle title="만날 수 있는 행사" note="이번 판매가 확인됐거나, 캐릭터 테마로 연결된 행사예요."/><div className="sc-event-grid">{relatedEvents.map(e => <EventCard key={e.id} event={e}/>)}</div></section><section className="sc-section"><SectionTitle title="이 캐릭터의 굿즈"/><div className="sc-goods-grid is-four">{related.map(g => <GoodCard key={g.id} good={g}/>)}</div></section><section className="sc-section"><SectionTitle title="함께 만드는 작가"/><div className="sc-creators-grid">{creators.filter(c => creatorHasSubject(c.id, s.id)).map(c => <CreatorCard key={c.id} creator={c}/>)}</div></section></>
}
function CreatorDetail() {
  const { id } = useParams(), c = creators.find(c => c.id === id)
  if (!c) return <Empty title="작가를 찾지 못했어요" body="작가 목록에서 다시 선택해주세요." to="/creators"/>
  const items = goods.filter(g => g.creator === c.id), es = events.filter(e => items.some(g => g.event === e.id) || (c.id === 'moon' && e.id === 'moonfest'))
  return <><BackLink to="/creators">작가·서클</BackLink><section className="sc-identity-hero sc-creator-hero"><div className={'sc-avatar '+c.color}>{c.initials}</div><div><span className="sc-eyebrow">작가·서클 · {c.tags}</span><h1>{c.name}</h1><p>{c.bio}</p><FollowButton id={'creator:'+c.id}/><small>참가 소식과 확인된 판매 정보를 모아볼 수 있어요.</small></div></section><section className="sc-section"><SectionTitle title="작가의 대표작" note="캐릭터 활동을 살펴보세요. 이 작품들의 이번 행사 판매 여부와는 별개예요."/><div className="sc-artwork-grid">{artworks.filter(a=>a.creator===c.id).map(a=><article key={a.id} className="sc-artwork-card"><Link to={'/subjects/'+a.subject}><EditorialArtwork art={a}/></Link><span className="sc-meta">{a.style}</span><h3>{a.title}</h3><p>{a.note}</p><Link className="sc-text-link" to={'/subjects/'+a.subject}>{subjects.find(s=>s.id===a.subject)?.name} 더 보기 <Icon name="arrow" size={15}/></Link></article>)}</div></section><section className="sc-section"><SectionTitle title="다음 참가 행사" note="참가 확인과 판매물 확인은 별도로 표시해요."/><div className="sc-event-grid">{es.map(e => <EventCard key={e.id} event={e}/>)}</div></section><section className="sc-section"><SectionTitle title="작가의 굿즈"/><div className="sc-goods-grid is-four">{items.map(g => <GoodCard key={g.id} good={g}/>)}</div></section><div className="sc-evidence-note"><Icon name="info"/><p>이 작가의 과거 캐릭터 활동이 다음 행사의 판매를 의미하지는 않아요. 행사 판매표가 확인되면 별도로 연결해요.</p></div></>
}
function GoodDetail() {
  const { id } = useParams(), { save, state } = usePreview(), g = goods.find(g => g.id === id)
  const [params] = useSearchParams()
  if (!g) return <Empty title="굿즈를 찾지 못했어요" body="굿즈 목록에서 다시 선택해주세요." to="/goods"/>
  const e = events.find(e => e.id === g.event), c = creators.find(c => c.id === g.creator)!, s = subjects.find(s => s.id === g.subject)!
  return <><BackLink to="/goods">굿즈 둘러보기</BackLink><div className="sc-product-detail"><div className="sc-product-photo"><img src={base+g.image} alt={g.name}/></div><section className="sc-product-description"><Link className="sc-text-link" to={'/creators/'+c.id}>{c.name} <Icon name="chevron" size={16}/></Link><h1>{g.name}</h1><p>{g.description}</p><strong className="sc-product-price">{priceLabel(g.price)}</strong><span className="sc-meta">예시 판매표 기준 · 옵션에 따라 달라질 수 있어요.</span><Link className="sc-subject-tag" to={'/subjects/'+s.id}><Icon name="sparkles" size={16}/>{s.name}<Icon name="chevron" size={14}/></Link><div className="sc-sale-location"><span className={'sc-badge '+(e ? 'confirmed' : '')}>{e ? '이번 행사 판매 확인' : '행사 판매 미확인'}</span>{e ? <><h2><Link to={'/events/'+e.id}>{e.name} <Icon name="arrow" size={17}/></Link></h2><Link className="sc-text-link" to={'/booths/'+c.id+'/'+e.id+(params.get('day') ? '?day='+params.get('day') : '')}>이 부스 전체 보기 <Icon name="chevron" size={15}/></Link><p>{g.dates.map(dayLabel).join(' · ')}<br/>{e.place} · {g.booth} 부스</p></> : <><h2>아직 판매 행사가 연결되지 않았어요</h2><p>일단 보관해두고, 작가의 다음 소식을 확인해보세요.</p></>}</div><button className="sc-button sc-primary sc-full" onClick={() => save(g, params.get('day') || '')}><Icon name="bookmark"/>{state.saved.some(x => x.goodId === g.id) ? e ? '저장한 방문일 확인·추가' : '보관 상태 확인' : e ? '방문일 선택하고 저장' : '행사 미정으로 보관하기'}</button><p className="sc-help">저장은 개인 방문 계획이에요. 구매·예약이 진행되지는 않아요.</p><details className="sc-source-details"><summary>정보의 근거와 확인 상태</summary><p>화면 검토를 위한 예시 {e ? '행사 판매표' : '작가 상품 목록'} · 2026.10.08 확인으로 구성했어요. 실제 출처와 가격은 연결되지 않았어요.</p></details></section></div></>
}
function EventDetail() {
  const { id } = useParams(), e = events.find(e => e.id === id)
  const [params, setParams] = useSearchParams()
  const requestedView = params.get('view') || 'guide', previousView = useRef(requestedView)
  useEffect(() => {
    if (previousView.current !== requestedView) document.querySelector('.sc-event-tabs')?.scrollIntoView({ block: 'start' })
    previousView.current = requestedView
  }, [requestedView])
  if (!e) return <Empty title="행사를 찾지 못했어요" body="행사 목록에서 다시 선택해주세요." to="/events"/>
  const tab = ['guide','booths','reviews'].includes(params.get('view') || '') ? params.get('view')! : 'guide', day = params.get('day') || '', q = params.get('q') || ''
  const products = goods.filter(g => g.event === e.id && (!day || g.dates.includes(day)) && (g.name+' '+creators.find(c => c.id === g.creator)?.name+' '+subjects.find(s => s.id === g.subject)?.name).includes(q))
  const change = (key: string, value: string) => { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); setParams(next, { preventScrollReset: true }) }
  return <><BackLink to="/events">행사 찾기</BackLink><section className="sc-event-detail-hero"><EventArt event={e} large/><div><span className="sc-eyebrow">{e.type} · {e.edition}</span><h1>{e.name}</h1><p>{e.description}</p><dl className="sc-event-facts"><div><dt><Icon name="calendar" size={17}/>일정</dt><dd>{e.label}<small>{e.hours}</small></dd></div><div><dt><Icon name="pin" size={17}/>장소</dt><dd>{e.place}</dd></div><div><dt><Icon name="ticket" size={17}/>입장</dt><dd>{e.admission}</dd></div></dl><span className="sc-meta">예시 행사 정보 · 2026.10.08 기준</span></div></section><nav className="sc-detail-tabs sc-event-tabs" aria-label="행사 정보"><button className={tab === 'guide' ? 'is-active' : ''} aria-pressed={tab === 'guide'} onClick={() => change('view', 'guide')}>행사 안내</button><button className={tab === 'booths' ? 'is-active' : ''} aria-pressed={tab === 'booths'} onClick={() => change('view', 'booths')}>참가 부스·굿즈</button><button className={tab === 'reviews' ? 'is-active' : ''} aria-pressed={tab === 'reviews'} onClick={() => change('view', 'reviews')}>이번·지난 회차 후기</button></nav>
    {tab === 'booths' && <section className="sc-section"><SectionTitle title="내 취향의 부스 찾기" note="실제 판매일을 선택하면 그날 만날 수 있는 굿즈만 보여요."/><div className="sc-event-filters"><label>방문일<select value={day} onChange={ev => change('day', ev.target.value)}><option value="">모든 날짜</option>{e.dates.map(d => <option key={d} value={d}>{dayLabel(d)}</option>)}</select></label><label>캐릭터·작가·굿즈<input value={q} maxLength={100} onChange={ev => change('q', ev.target.value)} placeholder="루나, 달작업실, 키링"/></label></div><div className="sc-booth-strip">{creators.filter(c => products.some(g => g.creator === c.id) || (e.id === 'moonfest' && c.id === 'moon' && (!q || c.name.includes(q)))).map(c => <Link key={c.id} to={'/booths/'+c.id+'/'+e.id+(day ? '?day='+day : '')}><span className={'sc-avatar '+c.color}>{c.initials}</span><span><strong>{c.name}</strong><small>{products.find(g => g.creator === c.id)?.booth || e.booth} · 부스 전체 보기</small></span><Icon name="chevron" size={16}/></Link>)}</div>{products.length ? <div className="sc-goods-grid is-four">{products.map(g => <GoodCard key={g.id} good={g} preferredDay={day}/>)}</div> : <Empty title={e.id === 'moonfest' ? '판매표를 기다리고 있어요' : '선택한 조건의 굿즈가 없어요'} body={e.id === 'moonfest' ? '달작업실의 참가와 캐릭터 테마는 확인했지만, 이번 판매물은 아직 미확인이에요.' : '방문일이나 검색어를 바꿔보세요. 작가의 모든 상품이 행사에서 판매되는 것은 아니에요.'} to={e.id === 'moonfest' ? '/creators/moon' : '/events/'+e.id+'?view=booths'} action={e.id === 'moonfest' ? '참가 작가 보기' : '조건 초기화'}/>}</section>}
    {tab === 'reviews' && <Reviews key={e.id} event={e}/>}
    {tab === 'guide' && <EventGuide key={e.id} event={e}/>}
  </>
}
function BoothDetail() {
  const { creatorId, eventId } = useParams(), [params] = useSearchParams()
  const c = creators.find(c => c.id === creatorId), e = events.find(e => e.id === eventId)
  const items = goods.filter(g => g.event === eventId && g.creator === creatorId)
  const day = params.get('day') || ''
  if (!c || !e || (!items.length && !(creatorId === 'moon' && eventId === 'moonfest'))) return <Empty title="참가 부스를 찾지 못했어요" body="행사 상세에서 참가 부스를 다시 선택해주세요." to="/events"/>
  const days = [...new Set(items.flatMap(g => g.dates))]
  const shown = items.filter(g => !day || g.dates.includes(day))
  return <><BackLink to={'/events/'+e.id+'?view=booths'+(day ? '&day='+day : '')}>{e.name}</BackLink><section className="sc-identity-hero sc-creator-hero"><div className={'sc-avatar '+c.color}>{c.initials}</div><div><span className="sc-eyebrow">{e.name} · 참가 부스</span><h1>{c.name} <span className="sc-booth-number">{items[0]?.booth || e.booth}</span></h1><p>{(days.length ? days : e.dates).map(dayLabel).join(' · ')}<br/>{e.place}</p><FollowButton id={'creator:'+c.id}/><Link className="sc-booth-profile-link" to={'/creators/'+c.id}>작가의 다른 행사도 보기 <Icon name="arrow" size={15}/></Link></div></section><section className="sc-section"><SectionTitle title="이 부스의 판매 굿즈" note={day ? dayLabel(day)+' 판매 확인 상품' : '이번 회차에서 판매가 확인된 상품만 모았어요.'}/>{shown.length ? <div className="sc-goods-grid is-four">{shown.map(g => <GoodCard key={g.id} good={g} preferredDay={day}/>)}</div> : <Empty title="아직 확인된 판매물이 없어요" body="작가의 참가가 확인되어도 다른 행사나 과거의 상품을 이번 판매물로 표시하지 않아요." to={'/creators/'+c.id} action="작가 소식 살펴보기"/>}</section><div className="sc-evidence-note"><Icon name="info"/><p>부스 번호와 참가일은 미리보기용 예시예요. 실제 운영에서는 해당 회차의 참가 공지와 배치도를 함께 확인해요.</p></div></>
}
function Reviews({ event }: { event: Event }) {
  const { state, update, toast } = usePreview()
  const [params] = useSearchParams()
  const [edition, setEdition] = useState(event.series.includes(params.get('edition') || '') ? params.get('edition')! : event.series[0]), [drafts, setDrafts] = useState<Record<string,string>>({})
  const body=drafts[edition]||''
  const setBody=(value:string)=>setDrafts(current=>({...current,[edition]:value}))
  const rows = state.reviews.filter(r => r.eventId === event.id && r.edition === edition)
  const submit = (ev: FormEvent) => { ev.preventDefault(); if (!body.trim()) return; update(s => ({ ...s, reviews: [{ id: crypto.randomUUID(), eventId: event.id, edition, body: body.trim(), mine: true, author: '나 · 미리보기' }, ...s.reviews] })); setBody(''); toast(`${edition}에 예시 후기를 저장했어요.`) }
  return <section className="sc-section sc-reviews"><SectionTitle title="이전의 만남은 어땠나요?" note="지난 회차의 경험을 읽고, 내가 다녀온 회차에 이야기를 남겨보세요."/><label className="sc-edition-select">후기를 볼 회차<select value={edition} onChange={ev => { setEdition(ev.target.value) }}>{event.series.map((s, i) => <option key={s} value={s}>{i ? '지난 회차' : '이번 회차'} · {s}</option>)}</select></label><p className="sc-edition-notice"><Icon name="info" size={17}/>{edition === event.series[0] ? '이번 회차는 개최 전이에요. 궁금한 점을 남길 수 있어요.' : '지난 회차의 후기예요. 이번 회차의 장소·운영·판매 정보와 다를 수 있어요.'}</p><form className="sc-review-form" onSubmit={submit}><label htmlFor="review-body">{edition}에 {edition === event.series[0] ? '질문·댓글' : '후기'} 작성</label><textarea id="review-body" rows={4} value={body} maxLength={1000} onChange={ev => setBody(ev.target.value)} placeholder="방문한 시간, 입장 경험, 다음 방문자에게 알려주고 싶은 점을 남겨주세요."/><div><span>미리보기 전용 · {body.length}/1,000</span><button className="sc-button sc-primary" disabled={!body.trim()}>등록하기</button></div></form><div className="sc-review-list">{rows.length ? rows.map(r => <article key={r.id}><div><strong>{r.author}</strong><span>{r.edition}</span>{r.mine && <button onClick={() => { update(s => ({ ...s, reviews: s.reviews.filter(x => x.id !== r.id) })); toast('후기를 삭제했어요.',()=>update(s=>({...s,reviews:s.reviews.some(x=>x.id===r.id)?s.reviews:[r,...s.reviews]}))) }}>삭제</button>}</div><p>{r.body}</p></article>) : <p className="sc-muted">아직 이 회차에 남겨진 이야기가 없어요.</p>}</div></section>
}
function SaveDialog({ good, preferredDay, close }: { good: Good; preferredDay: string; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), { state, update, toast } = usePreview()
  const [day, setDay] = useState(good.dates.includes(preferredDay) ? preferredDay : good.dates[0] || '')
  useEffect(() => { const previous = document.activeElement, node = dialog.current; node?.showModal(); return () => { node?.close(); if (previous instanceof HTMLElement) previous.focus({ preventScroll: true }) } }, [])
  const already = state.saved.some(s => s.goodId === good.id && s.day === day)
  const save = () => {
    if (already) return
    update(s => ({ ...s, saved: [...s.saved, { id: crypto.randomUUID(), goodId: good.id, day, done: false, note: '' }] }))
    toast(day ? `${dayLabel(day)} 방문 목록에 담았어요.` : '행사 미정 보관함에 담았어요.'); close()
  }
  return <dialog ref={dialog} className="sc-dialog" aria-labelledby="save-title" onCancel={close} onClick={ev => { if (ev.target === dialog.current) { const rect = dialog.current.getBoundingClientRect(); if (ev.clientX < rect.left || ev.clientX > rect.right || ev.clientY < rect.top || ev.clientY > rect.bottom) close() } }}><button className="sc-dialog-close sc-icon-button" aria-label="닫기" onClick={close}><Icon name="close"/></button><span className="sc-eyebrow">MY VISIT</span><h2 id="save-title">{good.event ? '언제 만나러 갈까요?' : '먼저 보관해둘까요?'}</h2><div className="sc-dialog-product"><img src={base+good.image} alt=""/><div><strong>{good.name}</strong><p>{good.event ? events.find(e => e.id === good.event)?.name : '아직 연결된 판매 행사가 없어요.'}</p></div></div>{good.event ? <fieldset><legend>판매가 확인된 방문일</legend>{good.dates.map(d => <label key={d} className={'sc-day-option'+(day === d ? ' is-selected' : '')}><input type="radio" name="visit-day" value={d} checked={day === d} onChange={() => setDay(d)}/><span>{dayLabel(d)}</span><small>{state.saved.some(s => s.goodId === good.id && s.day === d) ? '저장됨' : good.booth+' 부스'}</small></label>)}</fieldset> : <p className="sc-help">판매 행사가 확인되기 전까지 미정 보관함에 저장해요. 실제 예약이나 구매는 진행되지 않아요.</p>}<button className="sc-button sc-primary sc-full" onClick={save} disabled={already}>{already ? '이 목록에 이미 저장했어요' : '내 방문에 저장'}</button><Link className="sc-dialog-link" to="/visits" onClick={close}>저장한 목록 보기 <Icon name="arrow" size={16}/></Link></dialog>
}
function Notifications() {
  const { state, update } = usePreview(), [onlyUnread, setOnlyUnread] = useState(false)
  const rows = notices.filter(n => !onlyUnread || !state.read.includes(n.id))
  return <><PageTitle eyebrow="YOUR UPDATES" title="좋아하는 것들의 소식" body="관심 캐릭터와 작가의 다음 만남을 놓치지 마세요."/><div className="sc-notification-toolbar"><label><input type="checkbox" checked={onlyUnread} onChange={e => setOnlyUnread(e.target.checked)}/>안 읽은 소식만</label><button className="sc-text-button" onClick={() => update(s => ({ ...s, read: notices.map(n => n.id) }))}>모두 읽음</button><Link to="/account">수신 설정 <Icon name="chevron" size={15}/></Link></div><div className="sc-notice-list">{rows.map(n => <article key={n.id} className={!state.read.includes(n.id) ? 'is-unread' : ''}><img src={base+n.image} alt=""/><div><div className="sc-notice-meta"><span>{n.type}</span><time>{n.time}</time>{!state.read.includes(n.id) && <b>안 읽음</b>}</div><h2><Link to={n.to} onClick={() => update(s => ({ ...s, read: [...new Set([...s.read, n.id])] }))}>{n.title}</Link></h2><p>{n.body}</p><small>{n.reason}{!state.follows.includes(n.target) && ' · 현재 관심 해제됨'}</small><Link to={n.to} className="sc-text-link" onClick={() => update(s => ({ ...s, read: [...new Set([...s.read, n.id])] }))}>자세히 보기 <Icon name="arrow" size={15}/></Link></div></article>)}</div>{!rows.length && <Empty title="소식을 모두 확인했어요" body="안 읽은 소식만 보기를 끄면 이전 소식도 볼 수 있어요." to="/following" action="내 관심 둘러보기"/>}<p className="sc-help">위 소식은 알림 흐름을 보여주기 위한 예시예요. 실제 수집·발송은 연결되지 않았어요.</p></>
}
function Visits() {
  const { state, update, toast } = usePreview(), [filter, setFilter] = useState('all')
  const saved = state.saved.filter(s => filter === 'all' || (filter === 'undated' ? !s.day : !!s.day))
  const days = [...new Set(saved.map(s => s.day))].sort((a, b) => !a ? 1 : !b ? -1 : a.localeCompare(b))
  const total = state.saved.reduce((sum, s) => sum + (goods.find(g => g.id === s.goodId)?.price || 0), 0)
  return <><PageTitle eyebrow="MAKE IT A DAY" title="나의 다음 방문" body="만나고 싶은 것들을 모아, 나만의 하루를 만들어보세요."/><div className="sc-visit-summary"><div><Icon name="bookmark" size={24}/><span>저장한 굿즈<strong>{state.saved.length}<small>개</small></strong></span></div><div><span>예상 금액<strong>{priceLabel(total)}</strong></span></div><p>저장 항목별 1개 기준 · 개인 계획이며 주문이 아니에요.</p></div><div className="sc-filter-tabs sc-visit-tabs" aria-label="방문 목록 필터">{[['all','전체'],['dated','날짜별 방문'],['undated','행사 미정']].map(([key, label]) => <button key={key} className={filter === key ? 'is-active' : ''} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}</div>{!saved.length && <Empty title={filter === 'all' ? '첫 번째 발견을 담아보세요' : '이 목록은 아직 비어 있어요'} body="굿즈의 저장 버튼을 누르면 판매일을 골라 방문 목록을 만들 수 있어요." to="/goods" action="굿즈 둘러보기"/>}{days.map(day => <section key={day} className="sc-section"><SectionTitle title={day ? dayLabel(day) : '행사 미정 보관함'} note={!day ? '행사 판매가 확인되기 전까지 여기에 보관해요.' : undefined}/><div className="sc-visit-list">{saved.filter(s => s.day === day).map(item => { const g = goods.find(g => g.id === item.goodId)!; return <article key={item.id} className={item.done ? 'is-done' : ''}><img src={base+g.image} alt=""/><div className="sc-visit-item-main"><span className="sc-meta">{g.event ? `${events.find(e => e.id === g.event)?.name} · ${g.booth}` : '행사 판매 미확인'}</span><h3><Link to={'/goods/'+g.id}>{g.name}</Link></h3><strong>{priceLabel(g.price)}</strong><label className="sc-note-input">내 메모<input value={item.note} maxLength={200} placeholder="색상, 수령할 것, 기억할 내용" onChange={ev => update(s => ({ ...s, saved: s.saved.map(x => x.id === item.id ? { ...x, note: ev.target.value } : x) }))}/></label></div><div className="sc-visit-item-actions"><label><input type="checkbox" checked={item.done} onChange={ev => update(s => ({ ...s, saved: s.saved.map(x => x.id === item.id ? { ...x, done: ev.target.checked } : x) }))}/>{item.day ? '방문 완료' : '확인 완료'}</label><button className="sc-text-button" onClick={() => { update(s => ({ ...s, saved: s.saved.filter(x => x.id !== item.id) })); toast('목록에서 제거했어요.',()=>update(s=>({...s,saved:s.saved.some(x=>x.id===item.id)?s.saved:[...s.saved,item]}))) }} aria-label={g.name+' 목록에서 제거'}>목록에서 제거</button></div></article> })}</div></section>)}</>
}
function Following() {
  const {state}=usePreview()
  const ss=subjects.filter(s=>state.follows.includes('subject:'+s.id)),cs=creators.filter(c=>state.follows.includes('creator:'+c.id))
  const custom=state.customCharacters.filter(c=>state.follows.includes('custom:'+c.id))
  const works=[...catalogWorks,...state.customWorks].filter(w=>state.interestWorks.includes(w.id)&&!ss.some(s=>subjectWorkId(s.id)===w.id)&&!custom.some(c=>c.workId===w.id))
  return <><PageTitle eyebrow="YOUR FAVORITES" title="나의 관심" body="관심 캐릭터와 작가를 한곳에서 확인하세요."/><div className="sc-following-tools"><Link to="/account/interests">작품·캐릭터 편집 <Icon name="chevron" size={16}/></Link></div>
    {!ss.length&&!cs.length&&!custom.length&&!works.length&&<Empty title="아직 관심이 없어요" body="캐릭터나 작가의 하트를 눌러 담아보세요." to="/subjects" action="캐릭터 찾아보기"/>}
    {(ss.length>0||custom.length>0)&&<section className="sc-section"><SectionTitle title="관심 캐릭터" to="/subjects" link="더 찾아보기"/><div className="sc-subject-grid">{ss.map(s=><SubjectCard key={s.id} subject={s}/>)}{custom.map(c=><article className="sc-subject-card sc-custom-followed" key={c.id}><div className="sc-custom-followed-avatar">{c.name.slice(0,1)}</div><span className="sc-meta">{[...catalogWorks,...state.customWorks].find(w=>w.id===c.workId)?.title}</span><h3>{c.name}</h3><span className="sc-meta">정보 연결 대기</span><FollowButton id={'custom:'+c.id}/></article>)}</div></section>}
    {works.length>0&&<section className="sc-section"><SectionTitle title="관심 작품"/><div className="sc-following-works">{works.map(w=><Link key={w.id} to={w.id.startsWith('custom-work:')?'/account/interests':'/explore?kind=subjects&q='+encodeURIComponent(w.title)}><span><small>{w.kind}</small><strong>{w.title}</strong></span><Icon name="chevron" size={17}/></Link>)}</div></section>}
    {cs.length>0&&<section className="sc-section"><SectionTitle title="관심 작가·서클" to="/creators" link="더 찾아보기"/><div className="sc-creators-grid">{cs.map(c=><CreatorCard key={c.id} creator={c}/>)}</div></section>}</>
}
function Account() {
  const { state, update, toast } = usePreview()
  const [confirmReset, setConfirmReset] = useState(false)
  return <><PageTitle eyebrow="MY BOOTHHANA" title="마이페이지" body="관심 소식과 방문 계획을 나에게 맞게 관리하세요."/><div className="sc-settings"><section><div className="sc-demo-profile"><span className="sc-account-link">나</span><div><h2>미리보기 사용자</h2><p>실제 로그인 없이 화면 흐름을 체험하고 있어요.</p></div></div><Link className="sc-settings-link" to="/following"><span>관심 캐릭터·작가 <b>{state.follows.length}</b></span><Icon name="chevron"/></Link><Link className="sc-settings-link" to="/visits"><span>내 방문과 보관함 <b>{state.saved.length}</b></span><Icon name="chevron"/></Link></section><InterestSummary/><section><h2>소식 받는 방법</h2><div className="sc-setting-row"><div><strong>사이트 알림함</strong><p>관심 대상의 소식을 사이트에서 확인해요.</p></div><span className="sc-badge confirmed">기본 제공</span></div><div className="sc-setting-row"><div><strong>이 기기에서 웹 푸시 받기</strong><p>선택형 기능 · 지금은 설정 화면만 체험할 수 있어요.</p></div><button role="switch" aria-checked={state.push} aria-label="웹 푸시 설정 미리보기" className={'sc-switch'+(state.push ? 'is-on' : '')} onClick={() => { update(s => ({ ...s, push: !s.push })); toast('설정 화면만 변경했어요. 실제 푸시는 등록되지 않아요.') }}><span/></button></div><p className="sc-help">실제 브라우저 권한 요청이나 푸시 구독·발송은 하지 않아요.</p></section><section><h2>미리보기 안내</h2><p>행사·작가·캐릭터·가격·소식은 화면 검토용 예시예요. 관심 등록, 방문 목록, 메모와 후기는 현재 브라우저에만 저장돼요.</p><p>다른 분야 링크는 실제 사이트를 새 창으로 열어요. 이 화면의 데이터가 해당 사이트에 반영되지는 않아요.</p>{confirmReset ? <div className="sc-reset-confirm"><p>미리보기에서 추가한 관심·방문·후기를 지우고 처음 상태로 되돌릴까요?</p><button className="sc-button sc-primary" onClick={() => { update(() => structuredClone(initialState)); setConfirmReset(false); toast('미리보기를 처음 상태로 되돌렸어요.') }}>초기화하기</button> <button className="sc-button" onClick={() => setConfirmReset(false)}>취소</button></div> : <button className="sc-button" onClick={() => setConfirmReset(true)}>예시 데이터 초기화</button>}</section></div></>
}
