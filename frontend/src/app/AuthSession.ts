import type { User } from '../types'
import { ConsoleDraftStore } from './ConsoleDraftStore'

export type AuthStatus = 'checking' | 'authenticated' | 'anonymous' | 'error'
export interface AuthSnapshot { status: AuthStatus; user: User | null; error: string; generation: number }
export const AUTH_CHECK_FAILED = '로그인 상태를 확인하지 못했어요. 저장 위치를 바꾸지 않았습니다. 다시 확인해 주세요.'

/** A failed identity lookup is NOT a logout. No stale identity is exposed while checking. */
export class AuthSession {
  readonly drafts = new ConsoleDraftStore()
  private snapshot: AuthSnapshot = { status: 'checking', user: null, error: '', generation: 0 }
  private listeners = new Set<(value: AuthSnapshot) => void>()
  private pending: Promise<void> | null = null
  private signingOut: Promise<void> | null = null
  private readonly me: () => Promise<User>
  private readonly signOut: () => Promise<void>
  private readonly identityChanged: () => void
  private identity: string | null = null
  constructor(me: () => Promise<User>, signOut: () => Promise<void>, identityChanged: () => void = () => {}) {
    this.me = me; this.signOut = signOut; this.identityChanged = identityChanged
  }
  read = (): AuthSnapshot => this.snapshot
  subscribe = (listener: (value: AuthSnapshot) => void) => {
    this.listeners.add(listener); listener(this.snapshot)
    return () => { this.listeners.delete(listener) }
  }
  private set(status: AuthStatus, user: User | null, error = '', generation = this.snapshot.generation) {
    const identity = status === 'authenticated' && user
      ? `member:${user.id}:${[...user.permissions].sort().join(',')}`
      : status === 'anonymous' ? 'anonymous' : null
    // Temporary checking/error is not logout. Notify only a confirmed identity/permission change.
    if (identity !== null && identity !== this.identity) {
      this.identity = identity
      this.identityChanged()
    }
    this.snapshot = { status, user, error, generation }
    this.drafts.observe(this.snapshot)
    this.listeners.forEach(listener => listener(this.snapshot))
  }
  refresh = (): Promise<void> => {
    if (this.signingOut) return this.signingOut.catch(() => {})
    if (this.pending) return this.pending
    const generation = this.snapshot.generation + 1
    this.set('checking', null, '', generation)
    const request = (async () => {
      try {
        const user = await this.me()
        if (!user || !Number.isSafeInteger(user.id) || user.id < 1 || !Array.isArray(user.permissions)) throw new Error('Invalid identity response')
        if (this.snapshot.generation === generation) this.set('authenticated', user)
      } catch (error) {
        if (this.snapshot.generation !== generation) return
        // /api/me is protected; only an explicit HTTP 401 establishes anonymous mode.
        const anonymous = !!error && typeof error === 'object' && 'status' in error && error.status === 401
        this.set(anonymous ? 'anonymous' : 'error', null, anonymous ? '' : AUTH_CHECK_FAILED)
      }
    })()
    this.pending = request
    void request.finally(() => { if (this.pending === request) this.pending = null })
    return request
  }
  logout = (): Promise<void> => {
    if (this.signingOut) return this.signingOut
    this.drafts.reset() // Explicit sign-out discards drafts even if the request later fails.
    const generation = this.snapshot.generation + 1
    this.pending = null; this.set('checking', null, '', generation)
    const request = (async () => {
      try {
        await this.signOut()
        if (this.snapshot.generation === generation) this.set('anonymous', null)
      } catch (error) {
        if (this.snapshot.generation === generation) this.set('error', null, '로그아웃 결과를 확인하지 못했어요. 계정을 다시 확인해 주세요.')
        throw error
      }
    })()
    this.signingOut = request
    void request.then(() => { if (this.signingOut === request) this.signingOut = null }, () => { if (this.signingOut === request) this.signingOut = null })
    return request
  }
  cancel = () => { this.drafts.reset(); this.pending = null; this.set('checking', null, '', this.snapshot.generation + 1) }
}
