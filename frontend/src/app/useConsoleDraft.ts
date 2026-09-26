import { useEffect, useRef, useSyncExternalStore, type SetStateAction } from 'react'
import { useAuth } from './useAuth'

/** Survives the ConsoleLayout auth gate, but never crosses an account/permission epoch. */
export function useConsoleDraft<T>(key: string, initial: T) {
  const auth = useAuth()
  const store = auth.drafts
  useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion)
  const lease = store.lease(key)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const value = store.read(lease, initial)
  const setValue = (next: SetStateAction<T>) => {
    if (!alive.current || !store.canUse(lease)) return
    store.set(lease, typeof next === 'function'
      ? (next as (current: T) => T)(store.read(lease, initial)) : next)
  }
  const controls = {
    ...store.status(lease),
    begin: () => alive.current && store.begin(lease),
    finish: () => store.finish(lease),
    saved: () => store.saved(lease),
    failed: (error: unknown) => store.failed(lease, error instanceof Error ? error.message : '저장하지 못했습니다. 다시 확인해 주세요.'),
    isCurrent: () => alive.current && store.canUse(lease),
  }
  return [value, setValue, controls] as const
}
