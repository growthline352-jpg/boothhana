import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type SetStateAction } from 'react'
import { RemoteScope } from './RemoteScope'

export function useRemote<T>(load: () => Promise<T>, dependencies: readonly unknown[] = []) {
  // A -> B -> A creates three different scope objects. Old closures can never reactivate one.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const scope = useMemo(() => new RemoteScope(), dependencies)
  const [result, setResult] = useState<{ scope: RemoteScope; data: T | null; loading: boolean; error: Error | null }>({
    scope, data: null, loading: true, error: null,
  })
  useLayoutEffect(() => {
    scope.activate()
    return () => scope.deactivate()
  }, [scope])

  const reload = useCallback(async () => {
    const ticket = scope.begin()
    if (ticket === null) return
    setResult(previous => ({ scope, data: previous.scope === scope ? previous.data : null, loading: true, error: null }))
    try {
      const data = await load()
      if (scope.accepts(ticket)) setResult({ scope, data, loading: false, error: null })
    } catch (caught) {
      if (scope.accepts(ticket)) setResult({ scope, data: null, loading: false,
        error: caught instanceof Error ? caught : new Error('데이터를 불러오지 못했습니다.') })
    }
  // Callers include every lookup key in dependencies; load is captured for that scope only.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope])
  useEffect(() => { void reload() }, [reload])
  const setData = useCallback((next: SetStateAction<T | null>) => {
    // An explicit successful write is newer than any GET already in flight.
    // Invalidate those tickets so neither a late result nor a late error can undo it.
    if (scope.begin() === null) return
    setResult(previous => ({ scope, data: typeof next === 'function'
      ? (next as (value: T | null) => T | null)(previous.scope === scope ? previous.data : null) : next,
      loading: false, error: null }))
  }, [scope])
  // Hide old data during render, even before the new effect has run.
  return result.scope === scope ? { data: result.data, loading: result.loading, error: result.error, reload, setData }
    : { data: null, loading: true, error: null, reload, setData }
}
