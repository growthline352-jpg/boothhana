import { afterEach, expect, it, vi } from 'vitest'
import { resetCsrfToken } from '../../api/client'
import { remoteCache } from '../../app/RemoteCache'
import { loadCatalog } from './data'

afterEach(() => { vi.unstubAllGlobals(); resetCsrfToken() })
it('recreates the outing catalog resource after initial identity discovery and ignores the retired response', async () => {
  const delayed: ((response: Response) => void)[] = []
  let firstVisit = true
  const transport = vi.fn(() => firstVisit
    ? new Promise<Response>(resolve => delayed.push(resolve))
    : Promise.resolve(new Response(JSON.stringify({ items: [], total: 0 }), { headers: { 'Content-Type': 'application/json' } })))
  vi.stubGlobal('fetch', transport)
  const key = 'features/outings/catalog'
  const previous = remoteCache.get<Awaited<ReturnType<typeof loadCatalog>>>(key)
  previous.bind(() => loadCatalog(new AbortController().signal))
  const pending = previous.load()
  await vi.waitFor(() => expect(delayed).toHaveLength(3))
  const epoch = remoteCache.readEpoch()
  resetCsrfToken()
  expect(remoteCache.readEpoch()).toBeGreaterThan(epoch)
  firstVisit = false
  const current = remoteCache.get<Awaited<ReturnType<typeof loadCatalog>>>(key)
  expect(current).not.toBe(previous)
  current.bind(() => loadCatalog(new AbortController().signal))
  await current.load()
  for (const resolve of delayed) resolve(new Response(JSON.stringify({ items: [], total: 0 })))
  await pending
  expect(previous.read().data).toBeNull()
  expect(current.read()).toEqual({ data: { places: [], limited: false }, loading: false, error: null })
  expect(transport).toHaveBeenCalledTimes(6)
})
