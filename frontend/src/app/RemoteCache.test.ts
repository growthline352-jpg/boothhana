import { describe, expect, it, vi } from 'vitest'
import { RemoteCache, RemoteResource, remoteKey } from './RemoteCache'

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

describe('session screen resources', () => {
  it('renders data immediately after leaving and returning without invoking the loader', async () => {
    const cache = new RemoteCache(), key = remoteKey('characters', ['WORK-1', 0])
    const load = vi.fn().mockResolvedValue(['luna'])
    const first = cache.get<string[]>(key); first.bind(load)
    const leave = first.subscribe(() => {})
    await first.load(); leave()
    const returned = cache.get<string[]>(key); returned.bind(load)
    expect(returned.read()).toEqual({ data: ['luna'], loading: false, error: null })
    await returned.load()
    expect(load).toHaveBeenCalledTimes(1)
  })
  it('shares a pending read even if a screen leaves before it finishes', async () => {
    const cache = new RemoteCache(), pending = deferred<string>(), load = vi.fn(() => pending.promise)
    const first = cache.get<string>('detail'); first.bind(load)
    const leave = first.subscribe(() => {}), request = first.load(); leave()
    const returned = cache.get<string>('detail'); returned.bind(load)
    const secondRequest = returned.load()
    expect(secondRequest).toBe(request)
    pending.resolve('ready'); await request
    expect(returned.read().data).toBe('ready')
    expect(load).toHaveBeenCalledTimes(1)
  })
  it('loads each distinct query once and keeps empty/null results', async () => {
    const cache = new RemoteCache(), load = vi.fn().mockResolvedValue(null)
    for (const query of ['a', 'b', 'a']) {
      const entry = cache.get<null>(remoteKey('search', [query])); entry.bind(load); await entry.load()
      expect(entry.read().loading).toBe(false)
    }
    expect(load).toHaveBeenCalledTimes(2)
  })
  it('retries a failed read when the screen returns', async () => {
    const entry = new RemoteResource<string>(), load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue('online')
    entry.bind(load); await entry.load(); expect(entry.read().error?.message).toBe('offline')
    await entry.load(); expect(entry.read().data).toBe('online'); expect(load).toHaveBeenCalledTimes(2)
  })
  it('updates all mounted views after a write without clearing displayed data', async () => {
    const cache = new RemoteCache(), entry = cache.get<string>('comments'), pending = deferred<string>()
    entry.bind(async () => 'before'); await entry.load()
    const listener = vi.fn(), leave = entry.subscribe(listener)
    entry.bind(() => pending.promise); cache.invalidate()
    expect(entry.read()).toEqual({ data: 'before', loading: false, error: null })
    pending.resolve('after'); await entry.load()
    expect(entry.read().data).toBe('after'); expect(listener).toHaveBeenCalled(); leave()
  })
  it('does not request unmounted screens after a mutation until they are visited', async () => {
    const cache = new RemoteCache(), entry = cache.get<string>('detail'), load = vi.fn().mockResolvedValue('current')
    entry.bind(load); await entry.load(); cache.invalidate()
    await Promise.resolve(); expect(load).toHaveBeenCalledTimes(1)
    await cache.get<string>('detail').load(); expect(load).toHaveBeenCalledTimes(2)
  })
  it.each(['result', 'error'])('a late %s cannot overwrite an acknowledged save', async outcome => {
    const entry = new RemoteResource<string>(), pending = deferred<string>()
    entry.bind(() => pending.promise); const request = entry.load()
    entry.write('saved')
    if (outcome === 'result') pending.resolve('old'); else pending.reject(new Error('old failure'))
    await request; expect(entry.read()).toEqual({ data: 'saved', loading: false, error: null })
  })
  it('retires old account resources and cannot restore them through a late response', async () => {
    const cache = new RemoteCache(), pending = deferred<string>(), old = cache.get<string>('private')
    old.bind(() => pending.promise); const request = old.load()
    cache.clear(); const current = cache.get<string>('private')
    pending.resolve('previous user'); await request; old.write('old callback')
    expect(current).not.toBe(old)
    expect(current.read()).toEqual({ data: null, loading: true, error: null })
    expect(cache.readEpoch()).toBe(1)
  })
  it('keeps query keys stable while distinguishing resource, entity, undefined and null', () => {
    expect(remoteKey('search', [new URLSearchParams('kind=A&q=cat')])).toBe(remoteKey('search', [new URLSearchParams('q=cat&kind=A')]))
    expect(remoteKey('search', [{q:'cat',page:0}])).toBe(remoteKey('search', [{page:0,q:'cat'}]))
    expect(remoteKey('detail', [1])).not.toBe(remoteKey('list', [1]))
    expect(remoteKey('detail', [1])).not.toBe(remoteKey('detail', [2]))
    expect(remoteKey('detail', [null])).not.toBe(remoteKey('detail', [undefined]))
  })
})
