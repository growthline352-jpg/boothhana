import type { SetStateAction } from 'react'

export type RemoteSnapshot<T> = { data: T | null; loading: boolean; error: Error | null }

/** One resource per query for the lifetime of the loaded application. */
export class RemoteResource<T> {
  private snapshot: RemoteSnapshot<T> = { data: null, loading: true, error: null }
  private listeners = new Set<() => void>()
  private loader: (() => Promise<T>) | null = null
  private pending: Promise<void> | null = null
  private sequence = 0
  private settled = false
  private stale = true
  private retired = false

  read = () => this.snapshot
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  bind(load: () => Promise<T>) { this.loader = load }
  private publish(snapshot: RemoteSnapshot<T>) {
    this.snapshot = snapshot
    this.listeners.forEach(listener => listener())
  }
  load(force = false): Promise<void> {
    if (this.retired || !this.loader) return Promise.resolve()
    if (!force && this.pending) return this.pending
    if (!force && !this.stale && this.settled) return Promise.resolve()
    const ticket = ++this.sequence, loader = this.loader
    // Keep an already displayed screen usable while refreshing after a write.
    this.publish({ ...this.snapshot, loading: !this.settled, error: null })
    const request = Promise.resolve().then(loader).then(data => {
      if (ticket !== this.sequence || this.retired) return
      this.settled = true; this.stale = false
      this.publish({ data, loading: false, error: null })
    }, caught => {
      if (ticket !== this.sequence || this.retired) return
      // Failed reads are retryable on re-entry and never become permanent cached results.
      this.stale = true
      this.publish({ data: this.snapshot.data, loading: false,
        error: caught instanceof Error ? caught : new Error('데이터를 불러오지 못했습니다.') })
    }).finally(() => { if (this.pending === request) this.pending = null })
    this.pending = request
    return request
  }
  write(next: SetStateAction<T | null>) {
    if (this.retired) return
    ++this.sequence; this.pending = null; this.settled = true; this.stale = false
    const data = typeof next === 'function' ? (next as (value: T | null) => T | null)(this.snapshot.data) : next
    this.publish({ data, loading: false, error: null })
  }
  invalidate() {
    if (this.retired) return
    ++this.sequence; this.pending = null; this.stale = true
    if (this.listeners.size) void this.load()
  }
  retire() { this.retired = true; ++this.sequence; this.pending = null }
}

// Explicit namespaces distinguish resources with identical lookup conditions.
export function remoteKey(namespace: string, dependencies: readonly unknown[]): string {
  const seen = new Set<object>()
  const value = (item: unknown): unknown => {
    if (item === undefined) return ['undefined']
    if (typeof item === 'number' && !Number.isFinite(item)) return ['number', String(item)]
    if (typeof item === 'bigint') return ['bigint', String(item)]
    if (typeof item === 'function' || typeof item === 'symbol') throw new Error('조회 키에는 함수 대신 조회 조건을 사용하세요.')
    if (item === null || typeof item !== 'object') return item
    if (item instanceof URLSearchParams) return ['query', [...item.entries()].sort()]
    if (item instanceof Date) return ['date', item.toISOString()]
    if (seen.has(item)) throw new Error('조회 조건에 순환 참조를 사용할 수 없습니다.')
    seen.add(item)
    const result = Array.isArray(item) ? ['array', item.map(value)]
      : ['object', Object.keys(item).sort().map(key => [key, value((item as Record<string, unknown>)[key])])]
    seen.delete(item)
    return result
  }
  return JSON.stringify([namespace, dependencies.map(value)])
}

export class RemoteCache {
  private resources = new Map<string, RemoteResource<unknown>>()
  private epoch = 0
  private listeners = new Set<() => void>()
  readEpoch = () => this.epoch
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  get<T>(key: string): RemoteResource<T> {
    let resource = this.resources.get(key)
    if (!resource) { resource = new RemoteResource(); this.resources.set(key, resource) }
    return resource as RemoteResource<T>
  }
  invalidate() { this.resources.forEach(resource => resource.invalidate()) }
  clear() {
    this.resources.forEach(resource => resource.retire())
    this.resources.clear(); ++this.epoch
    this.listeners.forEach(listener => listener())
  }
}

export const remoteCache = new RemoteCache()
