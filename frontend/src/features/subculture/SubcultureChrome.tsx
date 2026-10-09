import type { ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import { DiscoveryIcon as Icon } from '../discovery/DiscoveryIcon'
import { categories, categoryHref } from '../discovery/categories'
import { currentSiteCategory } from '../discovery/site'
import './subcultureChrome.css'

export function SubcultureBrand() {
  return <span className="sc-subculture-logo"><img className="sc-subculture-symbol" src="/assets/categories/subculture-3d.webp" alt=""/><span className="sc-subculture-wordmark"><strong>부스하나</strong><span>서브컬처<i className="sc-brand-divider"/>SUBCULTURE</span></span></span>
}
export function SubcultureHeader({accountMenu}: {accountMenu: ReactNode}) {
  const location = useLocation(), home = currentSiteCategory() === 'subculture' ? '/' : '/subculture'
  const atHome = location.pathname === home || location.pathname === '/subculture'
  return <header className="sc-site-header"><div className="sc-container sc-header-inner">
    <Link className="sc-brand" to={home} aria-label="부스하나 서브컬처 홈"><SubcultureBrand/></Link>
    <nav className="sc-desktop-nav" aria-label="서브컬처 탐색"><Link to={home} aria-current={atHome ? 'page' : undefined}>발견</Link><NavLink to="/subculture/subjects">캐릭터 탐색</NavLink><NavLink to="/subculture/creators">작가·서클</NavLink><Link to="/discover?category=subculture" aria-current={location.pathname.startsWith('/discover') ? 'page' : undefined}>행사 찾기</Link></nav>
    <div className="sc-header-actions"><NavLink to="/subculture/search" aria-label="캐릭터·작가 검색"><Icon name="search" size={20}/></NavLink><NavLink to="/account/notifications" aria-label="알림"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg><span className="sc-desktop-label">알림</span></NavLink><NavLink to="/library" className="sc-desktop-label"><Icon name="bookmark" size={19}/>내 방문</NavLink>{accountMenu}</div>
  </div></header>
}
export function SubcultureMobileNav() {
  const location = useLocation(), home = currentSiteCategory() === 'subculture' ? '/' : '/subculture'
  const atHome = location.pathname === home || location.pathname === '/subculture'
  const exploring = !atHome && /^\/(subculture|discover)(\/|$)/.test(location.pathname)
  return <nav className="sc-site-mobile-nav" aria-label="주요 메뉴"><Link to={home} aria-current={atHome ? 'page' : undefined}><Icon name="grid"/><span>홈</span></Link><Link to="/subculture/search" aria-current={exploring ? 'page' : undefined}><Icon name="search"/><span>탐색</span></Link><NavLink to="/library"><Icon name="bookmark"/><span>내 방문</span></NavLink><Link to="/account" aria-current={/^\/(account|onboarding)(\/|$)/.test(location.pathname) ? 'page' : undefined}><Icon name="menu"/><span>마이</span></Link></nav>
}
export function SubcultureFooter({feedback, consent}: {feedback: () => void; consent: ReactNode}) {
  const home = currentSiteCategory() === 'subculture' ? '/' : '/subculture'
  return <footer className="sc-site-footer"><div className="sc-container"><div className="sc-footer-top"><div><Link to={home} aria-label="부스하나 서브컬처 홈"><SubcultureBrand/></Link><p>좋아하는 것을 발견하고, 직접 만나는 곳.</p></div><nav aria-label="다른 분야 사이트"><span>다른 부스하나 둘러보기</span>{categories.filter(category => category.key !== 'subculture').map(category => <Link key={category.key} to={categoryHref(category.key)}>{category.key === 'festivals' ? '축제·행사' : category.label} ↗</Link>)}</nav></div><div className="sc-footer-bottom"><span>© BoothHana</span><nav aria-label="이용 안내"><Link to="/about">회사소개</Link><Link to="/support">고객센터</Link><button onClick={feedback}>개선 의견</button>{consent}</nav><span>방문 전 주최 측의 최신 일정과 이용 조건을 확인해 주세요.</span></div></div></footer>
}
