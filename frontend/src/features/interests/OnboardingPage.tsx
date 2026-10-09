import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../../app/useAuth'
import { InterestSettings } from './InterestSettings'
import { onboardingReturn } from './api'
import { currentSiteCategory } from '../discovery/site'
import { InterestSettingsPage } from '../subculture/InterestSettingsPage'

export function OnboardingGate() {
  const auth = useAuth()
  const location = useLocation()
  return auth.status === 'authenticated' && auth.user?.onboardingRequired && !['/onboarding', '/login'].includes(location.pathname)
    ? <Navigate replace to={`/onboarding?returnTo=${encodeURIComponent(location.pathname + location.search)}`} /> : null
}

export function OnboardingPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  if(currentSiteCategory()==='subculture')return <InterestSettingsPage onboarding/>
  if (auth.loading) return <section className="content-wrap section-pad"><p role="status">계정을 확인하고 있어요.</p></section>
  if (!auth.user) return <section className="content-wrap section-pad"><h1>관심분야 선택</h1><p>로그인하면 관심분야를 계정에 저장할 수 있어요.</p>
    {auth.status === 'error' ? <button onClick={() => void auth.refresh()}>계정 다시 확인</button> : <a href={auth.loginUrl}>카카오로 로그인</a>}</section>
  if (!auth.user.onboardingRequired) return <Navigate replace to={onboardingReturn(params.get('returnTo'))}/>
  return <section className="content-wrap section-pad onboarding-page"><h1>내 취향으로 시작하기</h1>
    <InterestSettings key={auth.user.id} onboarding onComplete={() => navigate(onboardingReturn(params.get('returnTo')), { replace: true })}/></section>
}
