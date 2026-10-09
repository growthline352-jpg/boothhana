import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { authApi } from '../api'
import { API_BASE_URL, onSessionExpired, resetCsrfToken } from '../api/client'
import { AuthContext, type AuthValue } from './auth-context'
import { AuthSession } from './AuthSession'
import { disablePush } from '../features/subculture/push'
import { AuthIdentitySignal, identityFingerprint, listenIdentitySignal, readIdentitySignal, writeIdentitySignal } from './AuthIdentitySignal'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session] = useState(() => new AuthSession(authApi.me, async()=>{try{await disablePush()}catch{/* Logging out still takes priority if device cleanup fails. */}await authApi.logout()}, resetCsrfToken))
  const [snapshot, setSnapshot] = useState(session.read)
  const signal = useMemo(() => new AuthIdentitySignal(readIdentitySignal, writeIdentitySignal, () => {
    resetCsrfToken(); session.cancel(); void session.refresh()
  }), [session])
  useEffect(() => listenIdentitySignal(signal.check), [signal])
  useEffect(() => {
    if (snapshot.status !== 'authenticated' && snapshot.status !== 'anonymous') return
    const identity = snapshot.user ? `member:${snapshot.user.id}:${[...snapshot.user.permissions].sort().join(',')}` : 'anonymous'
    void identityFingerprint(identity).then(value => {
      if (session.read() === snapshot) signal.observe(value)
    }).catch(() => { /* Signal unavailable: server 401 handling still protects private requests. */ })
  }, [snapshot, session, signal])
  useEffect(() => onSessionExpired(() => {
    void session.refresh().then(() => {
      if (session.read().status === 'authenticated') resetCsrfToken()
    })
  }), [session])
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
