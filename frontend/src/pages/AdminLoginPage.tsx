import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { authApi } from '../api'
import { useAuth } from '../app/useAuth'

function safeReturn(value: string | null) {
  return value && /^\/admin(?:\/|$)/.test(value) && !value.startsWith('//') && !value.startsWith('/admin/login')
    ? value : '/admin/subculture'
}

export function AdminLoginPage() {
  const { user, loading, refresh, getSnapshot } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const destination = safeReturn(params.get('returnTo'))

  useEffect(() => { document.title = '관리자 로그인 · 부스하나' }, [])
  if (!loading && user?.permissions.includes('ADMIN')) return <Navigate to={destination} replace />

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      await authApi.adminLogin(username.trim(), password)
      setPassword('')
      await refresh()
      if (!getSnapshot().user?.permissions.includes('ADMIN')) throw new Error('관리자 세션을 확인하지 못했습니다.')
      navigate(destination, { replace: true })
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '로그인하지 못했습니다.')
    } finally { setBusy(false) }
  }

  return <main className="admin-login-page">
    <section className="admin-login-card" aria-labelledby="admin-login-title">
      <a className="admin-login-brand" href="/" aria-label="부스하나 홈"><img src="/assets/brand/logo.png" alt="부스하나" /></a>
      <div><span className="eyebrow">운영자 전용</span><h1 id="admin-login-title">관리자 로그인</h1><p>관리자용 아이디와 비밀번호를 입력해 주세요. 일반 사용자와 작가 로그인은 카카오 계정을 사용합니다.</p></div>
      <form onSubmit={submit}>
        <fieldset disabled={busy || loading}>
          <label className="field"><span>아이디</span><input className="input" name="username" autoComplete="username" required maxLength={100} autoFocus value={username} onChange={event => setUsername(event.target.value)} /></label>
          <label className="field"><span>비밀번호</span><input className="input" type="password" name="password" autoComplete="current-password" required maxLength={128} value={password} onChange={event => setPassword(event.target.value)} /></label>
          {error && <p className="form-alert" role="alert">{error}</p>}
          <button className="btn primary" type="submit">{busy || loading ? '확인 중…' : '관리자 로그인'}</button>
        </fieldset>
      </form>
      <a className="admin-login-back" href="/">사용자 화면으로 돌아가기</a>
    </section>
  </main>
}
