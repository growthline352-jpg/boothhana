import { createContext } from 'react'
import type { User } from '../types'
import type { AuthSnapshot, AuthStatus } from './AuthSession'
import type { ConsoleDraftStore } from './ConsoleDraftStore'

export interface AuthValue {
  drafts: ConsoleDraftStore
  user: User | null
  status: AuthStatus
  error: string
  generation: number
  getSnapshot: () => AuthSnapshot
  loading: boolean
  refresh: () => Promise<void>
  loginUrl: string
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthValue | null>(null)
