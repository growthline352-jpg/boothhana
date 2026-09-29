import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { RouteMetadata } from '../../app/PageMetadata'
import { AnalyticsConsent } from '../../features/analytics/AnalyticsConsent'
import { useAuth } from '../../app/useAuth'
import { AuthStatusNotice } from '../../app/AuthStatusNotice'
import { activeCategory, categories, categoryHref } from '../../features/discovery/categories'
import { DiscoveryIcon } from '../../features/discovery/DiscoveryIcon'
import '../../features/discovery/discovery.css'

export function PublicLayout() {
  const { user, loading, status, loginUrl, logout, refresh } = useAuth()
  const location = useLocation()
  const current = activeCategory(location.pathname, location.search)
  const menu = useRef<HTMLDetailsElement>(null)
  const lock = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const accountRole = user?.permissions.includes('ADMIN')
    ? '관리자'
    : user?.permissions.includes('CREATOR') ? '크리에이터' : '일반 사용자'
  const accountInitial = user?.displayName.trim() ? Array.from(user.displayName.trim())[0] : '내'
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
              <div className={`discovery-menu-account is-${status}`}>
                <span className="discovery-menu-avatar" aria-hidden="true">{loading ? '…' : accountInitial}</span>
                <div>
                  <small>{loading ? '계정 확인 중' : user ? `${accountRole} 계정` : status === 'error' ? '계정 확인 필요' : '게스트 이용 중'}</small>
                  <strong>{loading ? '잠시만 기다려 주세요' : user ? `${user.displayName}님` : status === 'error' ? '로그인 상태를 확인하지 못했어요' : '로그인하지 않았어요'}</strong>
                  <span>{user ? '이 계정에 예약과 보관함이 저장됩니다.' : status === 'error' ? '다시 확인하면 개인 메뉴를 안전하게 표시합니다.' : '로그인하면 예약과 보관함을 이어서 사용할 수 있어요.'}</span>
                </div>
              </div>
              {status === 'anonymous' && <a className="discovery-login-action" href={loginUrl}><span>카카오로 로그인</span><DiscoveryIcon name="arrow" size={16}/></a>}
              {status === 'error' && <button className="discovery-account-retry" type="button" onClick={() => void refresh()}>계정 상태 다시 확인</button>}
              <div className="discovery-menu-group">
                <span className="discovery-menu-caption">내 활동</span>
                <Link to="/library"><span>내 보관함</span><small>메모·방문 기록</small></Link>
                <Link to="/reservations"><span>내 예약</span><small>예약·수령 확인</small></Link>
                <Link to="/support"><span>고객센터</span><small>문의·신고 내역</small></Link>
              </div>
              <div className="discovery-menu-group">
                <span className="discovery-menu-caption">행사 이용</span>
                <Link to="/events"><span>예약 가능한 행사</span><DiscoveryIcon name="arrow" size={16}/></Link>
                <a href="/offline/index.html"><span>오프라인 자료</span><small>현장에서 열기</small></a>
              </div>
              {(user?.permissions.includes('CREATOR') || user?.permissions.includes('ADMIN')) && <div className="discovery-menu-group">
                <span className="discovery-menu-caption">운영 메뉴</span>
                {user.permissions.includes('CREATOR') && <Link to="/creator"><span>크리에이터 화면</span><DiscoveryIcon name="arrow" size={16}/></Link>}
                {user.permissions.includes('ADMIN') && <Link to="/admin/events"><span>관리자 화면</span><DiscoveryIcon name="arrow" size={16}/></Link>}
                {user.permissions.includes('ADMIN') && <Link to="/admin/subculture"><span>행사 수집 관리</span><DiscoveryIcon name="arrow" size={16}/></Link>}
              </div>}
              {user && <button className="discovery-logout-action" disabled={busy} onClick={() => void signOut()}>{busy ? '로그아웃 중…' : '로그아웃'}</button>}
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
    <AnalyticsConsent />
  </div>
}
