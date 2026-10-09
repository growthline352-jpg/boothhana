import { useCallback, useEffect, useLayoutEffect, useMemo, useSyncExternalStore, type SetStateAction } from 'react'
import { clearReadCache } from '../api/readCache'
import { remoteCache, remoteKey, type RemoteSnapshot } from './RemoteCache'
import { RemoteScope } from './RemoteScope'
const initialSnapshot = { data: null, loading: true, error: null }

export function useRemote<T>(namespace: string, load: () => Promise<T>, dependencies: readonly unknown[] = []) {
  const epoch = useSyncExternalStore(remoteCache.subscribe, remoteCache.readEpoch, () => 0)
  // Callers include every lookup condition in dependencies, independently of their loader closure.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const resource = useMemo(() => remoteCache.get<T>(remoteKey(namespace, dependencies)), [namespace, epoch, ...dependencies])
  // A new scope must retire callbacks from the previous query, even when that query is cached.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const scope = useMemo(() => new RemoteScope(), [resource])
  const result = useSyncExternalStore(resource.subscribe, resource.read, () => initialSnapshot as RemoteSnapshot<T>)
  useLayoutEffect(() => {
    scope.activate()
    resource.bind(load)
    return () => scope.deactivate()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, resource])
  useEffect(() => { void resource.load() }, [resource])
  const reload = useCallback(async () => {
    if (!scope.isActive()) return
    clearReadCache()
    await resource.load(true)
  }, [scope, resource])
  const setData = useCallback((next: SetStateAction<T | null>) => {
    if (scope.isActive()) resource.write(next)
  }, [scope, resource])
  return { ...result, reload, setData }
}
