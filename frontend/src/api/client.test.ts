import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, resetCsrfToken } from './client'

afterEach(() => { resetCsrfToken(); vi.unstubAllGlobals() })

describe('api request cancellation', () => {
  it('adds a default timeout signal', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await api('/api/test')

    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('gives a shared read its own timeout instead of another screen’s signal', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()

    await api('/api/test', { signal: controller.signal })

    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(init.signal).not.toBe(controller.signal)
  })
})
