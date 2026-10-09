// Memory only: a page reload starts a new cache, and account changes clear it.
const reads = new Map<string, Promise<unknown>>()
let generation = 0
export function readCacheGeneration() { return generation }
export function clearReadCache() { reads.clear(); ++generation }
export function forgetRead(key: string) { reads.delete(key) }

export function cachedRead<T>(key: string, load: () => Promise<T>): Promise<T> {
  const existing = reads.get(key)
  if (existing) return existing as Promise<T>
  const request = Promise.resolve().then(load).catch(error => {
    if (reads.get(key) === request) reads.delete(key)
    throw error
  })
  reads.set(key, request)
  return request
}

/** Cancelling one screen must not cancel a read shared by another screen. */
export function waitForRead<T>(request: Promise<T>, signal?: AbortSignal | null): Promise<T> {
  if (!signal) return request
  if (signal.aborted) return Promise.reject(signal.reason)
  return new Promise<T>((resolve, reject) => {
    const aborted = () => reject(signal.reason)
    signal.addEventListener('abort', aborted, { once: true })
    request.then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted))
  })
}
