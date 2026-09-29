import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../app/useAuth'
import './account.css'

const activity = [
  ['/library', '내 보관함', '저장한 행사·부스·상품과 메모, 방문 기록'],
  ['/library?offline=1', '오프라인 저장한 행사', '이 기기에 내려받은 행사 정보와 배치도'],
  ['/reservations', '내 예약', '예약 내역과 수령 상태 확인'],
] as const

function AccountLink({ to, title, description }: { to: string; title: string; description: string }) {
  return <Link className="account-row" to={to}><span><strong>{title}</strong><small>{description}</small></span><span aria-hidden="true">→</span></Link>
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
    <header className="account-heading"><p>마이페이지</p><h1>내 정보</h1><span>계정과 나의 행사 활동을 한곳에서 관리하세요.</span></header>
    <section className="account-profile" aria-label="계정 정보">
      {auth.loading ? <p role="status">계정 정보를 확인하고 있어요.</p> : auth.status === 'error' ? <>
        <h2>계정 정보를 확인하지 못했어요</h2><p>개인 정보는 잠시 숨겼습니다. 다시 확인해 주세요.</p><button className="btn secondary" onClick={() => void auth.refresh()}>다시 확인</button>
      </> : user ? <>
        <div className="account-identity"><span className="account-avatar" aria-hidden="true">{Array.from(user.displayName.trim())[0] || '나'}</span><div><span className="account-role">{role}</span><h2>{user.displayName || '회원'}님</h2><p>현재 로그인된 계정입니다.</p></div></div>
        <dl className="account-facts"><div><dt>표시 이름</dt><dd>{user.displayName || '이름 미등록'}</dd></div><div><dt>계정 유형</dt><dd>{role}</dd></div></dl>
        <p className="account-note">행사 주최자·부스 운영자 인증은 계정 유형과 별개입니다. 아래 ‘내 행사·부스 관리’에서 확인하세요.</p>
      </> : <>
        <h2>로그인하고 활동을 이어가세요</h2><p>로그인하면 계정 보관함과 예약, 문의 내역을 확인할 수 있어요.</p><a className="account-login" href={auth.loginUrl}>카카오로 로그인</a><p className="account-note">비회원도 이 기기의 보관함을 사용할 수 있습니다. 오프라인 자료는 저장한 기기에서만 열 수 있어요.</p>
      </>}
    </section>
    <div className="account-sections">
      <section aria-labelledby="account-activity"><h2 id="account-activity">내 활동</h2>{activity.map(([to,title,description])=><AccountLink key={to} to={to} title={title} description={description}/>)}</section>
      <section aria-labelledby="account-operations"><h2 id="account-operations">행사·부스 운영</h2><AccountLink to="/support/management" title="내 행사·부스 관리" description="주최자·부스 운영자 인증 신청 및 승인된 정보 관리"/>{user?.permissions.includes('CREATOR')&&<AccountLink to="/creator" title="크리에이터 작업 공간" description="부스와 상품·예약 운영"/>}{user?.permissions.includes('ADMIN')&&<AccountLink to="/admin/events" title="관리자 작업 공간" description="행사 운영과 관리 업무"/>}</section>
      <section aria-labelledby="account-support"><h2 id="account-support">고객지원</h2><AccountLink to="/support" title="문의·신고 및 답변 확인" description="내 문의와 잘못된 정보 신고의 처리 내역"/><AccountLink to="/support/new?category=EVENT_REQUEST" title="행사 추가 요청" description="찾는 행사가 없다면 등록을 요청하세요"/></section>
      <section aria-labelledby="account-storage"><h2 id="account-storage">저장 정보 안내</h2><p className="account-note">계정 보관함과 기기 임시 보관함은 별도로 관리됩니다. 기기 기록 가져오기·삭제는 보관함에서, 오프라인 저장본 삭제는 ‘오프라인 저장한 행사’에서 할 수 있습니다.</p><p className="account-note">프로필 변경·회원 탈퇴 기능은 아직 제공하지 않습니다. 계정 관련 문의는 고객센터를 이용해 주세요.</p></section>
    </div>
    {user&&<div className="account-session"><button type="button" className="btn secondary" disabled={busy} onClick={()=>void logout()}>{busy?'로그아웃 중…':'로그아웃'}</button>{error&&<p role="alert">{error}</p>}</div>}
  </section>
}
