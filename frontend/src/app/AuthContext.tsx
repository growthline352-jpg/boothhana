import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { authApi } from '../api'
import { API_BASE_URL, resetCsrfToken } from '../api/client'
import { AuthContext, type AuthValue } from './auth-context'
import { AuthSession } from './AuthSession'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session] = useState(() => new AuthSession(authApi.me, authApi.logout, resetCsrfToken))
  const [snapshot, setSnapshot] = useState(session.read)
  useEffect(() => {
    const unsubscribe = session.subscribe(setSnapshot)
    void session.refresh()
    return () => { unsubscribe(); session.cancel() }
  }, [session])
  const value = useMemo<AuthValue>(() => ({
    ...snapshot,
    drafts: session.drafts,
    loading: snapshot.status === 'checking',
    refresh: session.refresh,
    getSnapshot: session.read,
    loginUrl: `${API_BASE_URL}/api/auth/login`,
    logout: session.logout,
  }), [snapshot, session])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
