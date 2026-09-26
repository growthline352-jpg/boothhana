import { useEffect } from 'react'
import { useAuth } from '../app/useAuth'
import { LoadingState } from '../components/ui/States'

export function LoginPage() {
  const { loginUrl } = useAuth()
  useEffect(() => { window.location.replace(loginUrl) }, [loginUrl])
  return <LoadingState label="카카오 로그인으로 이동하고 있습니다" />
}
