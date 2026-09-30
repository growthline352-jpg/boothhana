import { PageMetadata } from '../../app/PageMetadata'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useAuth } from '../../app/useAuth'
import { AuthStatusNotice } from '../../app/AuthStatusNotice'
import { DiscoveryIcon, type IconName } from '../../features/discovery/DiscoveryIcon'
import { ProfileAvatar } from '../ui/ProfileAvatar'

interface ConsoleLink { to: string; label: string; icon: IconName }
const creatorLinks: ConsoleLink[] = [
  { to: '/creator', label: '홈', icon: 'grid' },
  { to: '/creator/events', label: '행사', icon: 'calendar' },
  { to: '/creator/booths', label: '부스', icon: 'building' },
  { to: '/creator/reservations', label: '예약', icon: 'ticket' },
  { to: '/creator/pos', label: 'POS', icon: 'check' },
  { to: '/creator/managed-exhibitors', label: '연결된 업체', icon: 'building' },
  { to: '/support', label: '고객센터', icon: 'info' },
  { to: '/creator/notices', label: '공지', icon: 'info' },
]
const adminLinks: ConsoleLink[] = [
  { to: '/admin/events', label: '행사', icon: 'calendar' },
  { to: '/admin/goods-showcase', label: '메인 굿즈', icon: 'sparkles' },
  { to: '/admin/applications', label: '참가 신청', icon: 'ticket' },
  { to: '/admin/comments', label: '행사 댓글', icon: 'info' },
  { to: '/admin/inquiries?category=EVENT_REQUEST', label: '행사 추가 요청', icon: 'info' },
  { to: '/admin/reports', label: '신고 내역', icon: 'info' },
  { to: '/admin/inquiries', label: '문의 내역', icon: 'info' },
  { to: '/admin/ownership', label: '주최자·부스 인증', icon: 'building' },
  { to: '/admin/event-series', label: '행사 회차 연결', icon: 'calendar' },
  { to: '/admin/subculture', label: '수집 관리', icon: 'grid' },
]

export function ConsoleLayout({ role }: { role: 'CREATOR' | 'ADMIN' }) {
  return <><PageMetadata /><ConsoleContent role={role} /></>
}
function ConsoleContent({ role }: { role: 'CREATOR' | 'ADMIN' }) {
  const { user, loading, status, loginUrl } = useAuth()
  const location = useLocation()
  const links = role === 'CREATOR' ? creatorLinks : adminLinks
  const title = role === 'CREATOR' ? '크리에이터' : '관리자'

  if (loading) return <div className="state-panel" role="status"><span className="spinner" aria-hidden="true" /><h2>계정을 확인하고 있습니다</h2></div>
  if (status === 'error') return <AuthStatusNotice />
  if (!user && role === 'ADMIN') {
    const returnTo = location.pathname + location.search
    return <div className="state-panel"><h2>관리자 로그인이 필요합니다</h2><p>운영자 전용 아이디와 비밀번호로 로그인해 주세요.</p><NavLink className="btn primary" to={`/admin/login?returnTo=${encodeURIComponent(returnTo)}`}>관리자 로그인</NavLink></div>
  }
  if (!user) return <div className="state-panel"><h2>로그인이 필요합니다</h2><p>카카오 계정으로 로그인한 뒤 다시 확인해 주세요.</p><a className="btn primary" href={loginUrl}>카카오 로그인</a></div>
  if (!user.permissions.includes(role) && role === 'ADMIN') {
    const returnTo = location.pathname + location.search
    return <div className="state-panel error-state" role="alert"><h2>관리자 계정이 아닙니다</h2><p>현재 카카오 계정 대신 운영자 전용 계정으로 로그인해 주세요.</p><NavLink className="btn primary" to={`/admin/login?returnTo=${encodeURIComponent(returnTo)}`}>관리자 로그인</NavLink></div>
  }
  if (!user.permissions.includes(role)) return <div className="state-panel error-state" role="alert"><h2>접근 권한이 없습니다</h2><p>현재 계정은 이 관리 화면을 사용할 수 없습니다.</p><NavLink className="btn secondary" to="/">행사 둘러보기</NavLink></div>

  return <div className="console-shell" data-console={role.toLowerCase()}>
    <a className="discovery-skip" href="#console-main">본문으로 바로가기</a>
    <header className="topbar console-topbar">
      <NavLink className="brand" to="/" aria-label="부스하나 홈"><span className="brand-logo"><img src="/assets/brand/logo.png" alt="부스하나" /></span></NavLink>
      <div className="topbar-actions"><span className="console-role-label">{title} 작업 공간</span><NavLink className="btn secondary" to="/">행사 둘러보기 <DiscoveryIcon name="arrow" size={16}/></NavLink></div>
    </header>
    <nav className="mobile-role-nav" aria-label={`${title} 모바일 메뉴`}>
      {links.map(({ to, label, icon }) => <NavLink key={to} to={to} end={to === '/creator'}><DiscoveryIcon name={icon} size={18}/><span>{label}</span></NavLink>)}
    </nav>
    <aside className="sidebar">
      <div className="console-user"><ProfileAvatar className="console-avatar" name={user.displayName} imageUrl={user.profileImageUrl} /><div><strong className="sidebar-user">{user.displayName}님</strong><span>{title} 계정</span></div></div>
      <p className="console-nav-caption">작업 메뉴</p>
      <nav className="side-nav" aria-label={`${title} 메뉴`}>{links.map(({ to, label, icon }) => <NavLink key={to} className="side-link" to={to} end={to === '/creator'}><DiscoveryIcon name={icon} size={19}/><span>{label}</span></NavLink>)}</nav>
      <div className="console-sidebar-footer"><p>방문자 화면에서<br/>공개된 안내를 확인하세요.</p><NavLink className="side-link" to="/">행사 둘러보기 <DiscoveryIcon name="arrow" size={17}/></NavLink></div>
    </aside>
    <main id="console-main" className="console-main" tabIndex={-1}><Outlet /></main>
  </div>
}
