import { useContext } from 'react'
import { useLocation } from 'react-router'
import { AuthContext } from './auth-context'

export function useAuth() {
  const location = useLocation()
  const value = useContext(AuthContext)
  if (!value) throw new Error('AuthProvider가 필요합니다.')
  const path=location.pathname+location.search
  return { ...value, loginUrl:`${value.loginUrl}${value.loginUrl.includes('?')?'&':'?'}returnTo=${encodeURIComponent(path)}` }
}
