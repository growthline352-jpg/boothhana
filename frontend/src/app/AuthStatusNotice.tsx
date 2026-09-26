import { useAuth } from './useAuth'
/** Unknown identity never prompts the visitor to silently start a new local collection. */
export function AuthStatusNotice() {
  const auth = useAuth()
  if (auth.status !== 'error') return null
  return <div className="notice-banner auth-status-notice" role="alert">
    <p>{auth.error || '계정 확인에 실패했어요. 개인 기록과 저장 위치는 변경하지 않았습니다.'}</p>
    <button className="btn secondary" type="button" onClick={() => void auth.refresh()}>계정 다시 확인</button>
  </div>
}
