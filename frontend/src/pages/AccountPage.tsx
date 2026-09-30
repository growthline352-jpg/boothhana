import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../app/useAuth'
import { DiscoveryIcon, type IconName } from '../features/discovery/DiscoveryIcon'
import './account.css'

function AccountLink({ to, title, description }: { to: string; title: string; description?: string }) {
  return <Link className="account-list-link" to={to}>
    <span><strong>{title}</strong>{description && <small>{description}</small>}</span>
    <DiscoveryIcon name="chevron" size={18} />
  </Link>
}

function Shortcut({ to, icon, title, description }: { to: string; icon: IconName; title: string; description: string }) {
  return <Link className="account-shortcut" to={to}>
    <span className="account-shortcut-icon"><DiscoveryIcon name={icon} size={24} /></span>
    <span className="account-shortcut-copy"><strong>{title}</strong><small>{description}</small></span>
    <DiscoveryIcon name="arrow" size={19} />
  </Link>
}

export function AccountPage() {
  const auth = useAuth()
  const lock = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const user = !auth.loading && auth.status === 'authenticated' ? auth.user : null
  const role = user?.permissions.includes('ADMIN') ? '관리자' : user?.permissions.includes('CREATOR') ? '크리에이터' : '일반 회원'
  const logout = async () => {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try { await auth.logout() }
    catch { setError('로그아웃하지 못했습니다. 잠시 후 다시 시도해 주세요.') }
    finally { lock.current = false; setBusy(false) }
  }
  return <section className="content-wrap section-pad account-page">
    <header className="account-heading"><h1>내 정보</h1></header>

    <section className={`account-welcome${user ? ' is-member' : ''}`} aria-label="계정 정보">
      {auth.loading ? <div className="account-welcome-copy"><span className="account-eyebrow">내 계정</span><h2 role="status">계정 정보를 확인하고 있어요.</h2></div>
        : auth.status === 'error' ? <><div className="account-welcome-copy"><span className="account-eyebrow">내 계정</span><h2>계정 정보를 확인하지 못했어요</h2><p>개인 정보는 잠시 숨겼습니다. 다시 확인해 주세요.</p></div><button className="account-welcome-action" onClick={() => void auth.refresh()}>다시 확인 <DiscoveryIcon name="arrow" size={17}/></button></>
          : user ? <><div className="account-welcome-copy"><span className="account-eyebrow">{role} 계정</span><h2>{user.displayName || '회원'}님, 안녕하세요</h2><p>저장한 행사와 내 활동을 여기서 확인하세요.</p></div><span className="account-avatar" aria-hidden="true">{Array.from(user.displayName.trim())[0] || '나'}</span></>
            : <><div className="account-welcome-copy"><span className="account-eyebrow">부스하나 계정</span><h2>로그인하고, 내 행사를 이어서 보세요</h2><p>저장한 행사와 예약·문의 내역을 한곳에서 확인할 수 있어요.</p></div><a className="account-welcome-action" href={auth.loginUrl}>카카오로 로그인 <DiscoveryIcon name="arrow" size={17}/></a></>}
    </section>

    <section className="account-quick-section" aria-labelledby="account-quick-title">
      <h2 id="account-quick-title">자주 찾는 메뉴</h2>
      <div className="account-shortcuts">
        <Shortcut to="/library" icon="bookmark" title="내 보관함" description="저장한 행사와 부스, 오프라인 자료" />
        <Shortcut to="/reservations" icon="ticket" title="내 예약" description="예약과 수령 내역" />
      </div>
    </section>

    <div className="account-groups">
      <section className="account-group" aria-labelledby="account-operation-title">
        <h2 id="account-operation-title">행사·부스 운영</h2>
        <div className="account-list">
          <AccountLink to="/support/management" title="내 행사·부스 관리" description="주최자·부스 운영자 인증 신청과 관리" />
          {user?.permissions.includes('CREATOR') && <AccountLink to="/creator" title="크리에이터 작업 공간" description="부스·상품·예약 운영" />}
          {user?.permissions.includes('ADMIN') && <AccountLink to="/admin/events" title="관리자 작업 공간" description="행사 운영과 관리 업무" />}
        </div>
      </section>
      <section className="account-group" aria-labelledby="account-support-title">
        <h2 id="account-support-title">도움이 필요할 때</h2>
        <div className="account-list">
          <AccountLink to="/support" title="문의·신고 내역" description="문의와 잘못된 정보 신고 확인" />
          <AccountLink to="/support/new?category=EVENT_REQUEST" title="행사 추가 요청" description="찾는 행사를 알려주세요" />
        </div>
      </section>
    </div>

    <div className="account-foot">
      <details className="account-storage"><summary>계정과 저장 정보 안내</summary><div><p>계정 보관함과 이 기기의 임시 보관함은 별도로 관리됩니다. 기기 기록 가져오기·삭제와 오프라인 저장은 내 보관함에서 관리할 수 있습니다.</p><p>프로필 변경·회원 탈퇴 기능은 아직 제공하지 않습니다. 계정 관련 문의는 고객센터를 이용해 주세요.</p></div></details>
      {user && <div className="account-session"><button type="button" disabled={busy} onClick={() => void logout()}>{busy ? '로그아웃 중…' : '로그아웃'}</button>{error && <p role="alert">{error}</p>}</div>}
    </div>
  </section>
}
