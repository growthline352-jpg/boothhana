import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { RouteMetadata } from '../../app/PageMetadata'
import { useAuth } from '../../app/useAuth'
import { AuthStatusNotice } from '../../app/AuthStatusNotice'
import { activeCategory, categories, categoryHref } from '../../features/discovery/categories'
import { DiscoveryIcon } from '../../features/discovery/DiscoveryIcon'
import '../../features/discovery/discovery.css'

export function PublicLayout() {
  const { user, loading, status, loginUrl, logout } = useAuth()
  const location = useLocation()
  const current = activeCategory(location.pathname, location.search)
  const menu = useRef<HTMLDetailsElement>(null)
  const lock = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { if(location.pathname!=='/'&&!location.pathname.startsWith('/discover'))window.scrollTo({ top: 0, left: 0, behavior: 'auto' }) }, [location.pathname])
  useEffect(() => { if (menu.current) menu.current.open = false; setError('') }, [location.pathname, location.search])
  useEffect(() => {
    const click = (e: PointerEvent) => { if (menu.current && !menu.current.contains(e.target as Node)) menu.current.open = false }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && menu.current?.open) {
        menu.current.open = false; menu.current.querySelector('summary')?.focus()
      }
    }
    document.addEventListener('pointerdown', click); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', click); document.removeEventListener('keydown', key) }
  }, [])
  const signOut = async () => {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try { await logout(); if (menu.current) menu.current.open = false }
    catch { setError('로그아웃하지 못했습니다. 다시 시도해 주세요.') }
    finally { lock.current = false; setBusy(false) }
  }
  return <div className="page-shell public-shell" data-category={current ?? 'subculture'}>
    <RouteMetadata />
    <a className="discovery-skip" href="#public-main">본문으로 바로가기</a>
    <header className="discovery-header">
      <div className="discovery-header-inner">
        <Link className="brand discovery-brand" to="/" aria-label="부스하나 홈">
          <span className="brand-logo"><img src="/assets/brand/logo.png" alt="부스하나" /></span>
        </Link>
        <nav className="discovery-category-nav" aria-label="행사 분야">
          {categories.map(category => <Link key={category.key} to={categoryHref(category.key)}
            className={`discovery-category-link${current === category.key ? ' is-current' : ''}`}
            aria-current={current === category.key ? 'page' : undefined}>
            <DiscoveryIcon name={category.icon} size={18} /><span>{category.label}{!category.enabled&&<small className="discovery-soon">준비 중</small>}</span>
          </Link>)}
        </nav>
        <div className="discovery-header-tools">
          <a className="memory-header-link discovery-offline-link" href="/offline/index.html" aria-label="오프라인 자료 열기"><DiscoveryIcon name="download" size={19}/><span>오프라인 자료</span></a><NavLink className="memory-header-link" aria-label="내 보관함" to="/library"><svg width="19" height="21" viewBox="0 0 18 20" aria-hidden="true"><path d="M4 2h10v16l-5-3-5 3Z" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg><span>내 보관함</span></NavLink>
          <NavLink className="discovery-reservations" aria-label="내 예약" to="/reservations"><DiscoveryIcon name="ticket" size={18}/><span>내 예약</span></NavLink>
          
          <details className="discovery-menu" ref={menu}>
            <summary aria-label="서비스 메뉴"><DiscoveryIcon name="menu"/></summary>
            <nav className="discovery-menu-panel" aria-label="서비스 메뉴">
              <p>{loading ? '계정을 확인하고 있습니다' : user ? `${user.displayName}님` : '부스하나 서비스'}</p>
              {status==='anonymous'&&<a href={loginUrl}>예약·관리 기능 로그인</a>}
              <a href="/offline/index.html">오프라인 자료 · 현장에서 열기</a><Link to="/library">내 보관함 · 메모·방문 기록</Link><Link to="/support">고객센터 · 내 문의·신고</Link>
              <Link to="/events">예약 가능한 행사 <DiscoveryIcon name="arrow" size={16}/></Link>
              <Link to="/reservations">내 예약 확인 <DiscoveryIcon name="ticket" size={16}/></Link>
              {user?.permissions.includes('CREATOR') && <Link to="/creator">크리에이터 화면</Link>}
              {user?.permissions.includes('ADMIN') && <Link to="/admin/events">관리자 화면</Link>}
              {user?.permissions.includes('ADMIN') && <Link to="/admin/subculture">행사 수집 관리</Link>}
              {user && <button disabled={busy} onClick={() => void signOut()}>{busy ? '로그아웃 중…' : '로그아웃'}</button>}
            </nav>
          </details>
        </div>
      </div>
    </header>
    {error && <p className="discovery-auth-error" role="alert">{error}</p>}
    <AuthStatusNotice />
    <main id="public-main" tabIndex={-1}><Outlet /></main>
    <nav className="public-mobile-nav" aria-label="자주 쓰는 메뉴">
      <Link to={categoryHref(current ?? 'subculture')} aria-current={location.pathname==='/'||location.pathname.startsWith('/discover')?'page':undefined}><DiscoveryIcon name="search"/><span>행사 찾기</span></Link>
      <NavLink to="/library"><DiscoveryIcon name="bookmark"/><span>내 보관함</span></NavLink>
      <a href="/offline/index.html"><DiscoveryIcon name="download"/><span>오프라인 자료</span></a>
    </nav>
    <footer className="discovery-footer"><div className="discovery-container discovery-footer-inner">
      <div><Link to="/" className="discovery-footer-brand">부스하나<span>취향을 따라, 오프라인으로.</span></Link>
        <p>서울·경기의 서브컬처·박람회·축제와 참가 부스·상품을 찾아보세요.</p>
        <small>방문 전 주최 측의 최신 일정과 이용 조건을 확인해 주세요.</small></div>
      <nav aria-label="푸터 메뉴">{categories.map(c => <Link key={c.key} to={categoryHref(c.key)}>{c.label}{!c.enabled && ' · 준비 중'}</Link>)}<Link to="/events">예약 가능한 행사</Link><Link to="/library">내 보관함</Link><Link to="/support">고객센터</Link></nav>
    </div></footer>
  </div>
}
