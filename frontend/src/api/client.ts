import type { ApiErrorBody } from '../types'
import { remoteCache } from '../app/RemoteCache'
import { cachedRead, clearReadCache, forgetRead, waitForRead } from './readCache'

export function normalizeApiBase(value: string): string {
  const raw = value.trim()
  if (!raw) return '' // Explicit same-origin hosting remains supported.
  let url: URL
  try { url = new URL(raw) }
  catch { throw new Error('VITE_API_BASE_URL은 올바른 API 서버 원점 주소여야 합니다.') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !/^\/+$/.test(url.pathname)) {
    throw new Error('VITE_API_BASE_URL에는 경로·쿼리·해시·인증정보 없이 API 서버 원점만 설정하세요.')
  }
  return url.origin
}
const API_BASE_URL = normalizeApiBase(import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080')
export const DEFAULT_API_TIMEOUT_MS = 20_000
// Render's free web service may need close to a minute to wake after inactivity.
// Use this only for the first public/auth reads that can trigger that wake-up.
export const COLD_START_API_TIMEOUT_MS = 75_000
export const COLD_START_RETRY_DELAY_MS = 1_200
const CANONICAL_VERCEL_HOST = 'boothhana.vercel.app'

export function canonicalProductionUrl(href: string, production = import.meta.env.PROD): string | null {
  if (!production) return null
  try {
    const url = new URL(href)
    if (!url.hostname.endsWith('.vercel.app') || url.hostname === CANONICAL_VERCEL_HOST) return null
    url.protocol = 'https:'
    url.hostname = CANONICAL_VERCEL_HOST
    url.port = ''
    return url.href
  } catch { return null }
}

export class ApiError extends Error {
  status: number
  code: string
  fieldErrors?: Record<string, string>
  requestId?: string
  constructor(body: ApiErrorBody) {
    const id = validRequestId(body.requestId)
    super(id ? `${body.message} (문의 코드: ${id})` : body.message)
    this.name = 'ApiError'
    this.status = body.status
    this.code = body.code
    this.fieldErrors = body.fieldErrors
    this.requestId = id
  }
}

function validRequestId(value: unknown): string | undefined {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : undefined
}

let csrfToken: string | null = null
let csrfRequest: Promise<string> | null = null
let csrfGeneration = 0
// Token renewal and a known authentication change are different boundaries.
// An ordinary CSRF retry must not invalidate unrelated in-flight requests.
let sessionGeneration = 0
let expiredSession = false
const expirationListeners = new Set<() => void>()
export function onSessionExpired(listener: () => void) {
  expirationListeners.add(listener)
  return () => { expirationListeners.delete(listener) }
}

function invalidateCsrfToken() {
  csrfGeneration += 1
  csrfToken = null
  csrfRequest = null
}

export function resetCsrfToken() {
  sessionGeneration += 1
  expiredSession = false
  invalidateCsrfToken()
  clearReadCache()
  remoteCache.clear()
}

async function readError(response: Response): Promise<ApiError> {
  let body: Partial<ApiErrorBody> = {}
  try {
    const value: unknown = await response.json()
    if (value && typeof value === 'object') body = value as Partial<ApiErrorBody>
  } catch { /* Non-JSON errors (proxy, OAuth, gateway) use a stable fallback. */ }
  return new ApiError({
    status: response.status,
    code: typeof body.code === 'string' ? body.code : 'REQUEST_FAILED',
    message: typeof body.message === 'string' ? body.message : '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    fieldErrors: body.fieldErrors,
    requestId: validRequestId(body.requestId) ?? validRequestId(response.headers?.get('X-Request-ID')),
  })
}

async function ensureCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken
  if (csrfRequest) return csrfRequest
  const generation = csrfGeneration
  const request = (async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15_000)
    try {
      // Keep the deadline through the body, not just until response headers arrive.
      const response = await fetch(`${API_BASE_URL}/api/auth/csrf`, { credentials: 'include', signal: controller.signal })
      if (!response.ok) throw await readError(response)
      const body: unknown = await response.json()
      controller.signal.throwIfAborted()
      const token = body && typeof body === 'object' && 'token' in body ? body.token : null
      if (typeof token !== 'string' || !token) throw new Error('보안 토큰을 준비하지 못했습니다.')
      if (generation === csrfGeneration) csrfToken = token
      return token
    } finally { clearTimeout(timer) }
  })()
  csrfRequest = request
  try { return await request }
  finally { if (csrfRequest === request) csrfRequest = null }
}

function replayable(body: BodyInit | null | undefined) {
  return body == null || typeof body === 'string' || body instanceof Blob || body instanceof FormData || body instanceof URLSearchParams
}

export type ApiRequestInit = RequestInit & { fresh?: boolean; readOnly?: boolean; reuse?: boolean; timeoutMs?: number }

export async function api<T>(path: string, options?: ApiRequestInit): Promise<T> {
  const { fresh = false, readOnly = false, reuse = true, timeoutMs = DEFAULT_API_TIMEOUT_MS, ...init } = options ?? {}
  const method = (init?.method ?? 'GET').toUpperCase()
  const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(method)
  // Identity and write-receipt checks must verify the server when explicitly requested.
  const volatile = path === '/api/me' || path.startsWith('/api/auth/') || /\/(?:[\w-]*requests)\//.test(path)
  const cacheable = reuse && (method === 'GET' || readOnly) && !volatile
  const url = new URL(path, API_BASE_URL || 'http://same-origin.invalid')
  url.searchParams.sort()
  const key = JSON.stringify([method, url.pathname + url.search, [...new Headers(init.headers).entries()].sort(), init.body ?? null])
  const session = sessionGeneration
  const transportSignal = cacheable ? null : init.signal
  const requireSameSession = () => {
    if (session !== sessionGeneration || mutation && expiredSession) throw new ApiError({
      status: 409, code: 'SESSION_CHANGED',
      message: '로그인 상태가 변경되어 이전 요청의 전송·재시도 또는 결과 반영을 중단했습니다. 이미 전송한 요청의 처리 결과는 다시 확인해 주세요.',
    })
  }
  async function send(retried: boolean): Promise<T> {
    transportSignal?.throwIfAborted()
    requireSameSession()
    const token = mutation ? await ensureCsrfToken() : null
    transportSignal?.throwIfAborted()
    requireSameSession()
    const headers = new Headers(init?.headers)
    if (init?.body != null && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }
    if (token) headers.set('X-XSRF-TOKEN', token)
    // A cached read belongs to the application; callers cancel only their own wait.
    const signal = cacheable ? AbortSignal.timeout(timeoutMs) : init?.signal ?? AbortSignal.timeout(timeoutMs)
    const response = await fetch(`${API_BASE_URL}${path}`, { ...init, method, headers, credentials: 'include', signal })
    requireSameSession()
    if (!response.ok) {
      const error = await readError(response)
      requireSameSession()
      // Retry only when Spring's CSRF filter explicitly rejected the request
      // before reaching a controller. Never retry arbitrary 403/network failures.
      if (!retried && token && response.status === 403 && error.code === 'CSRF_INVALID' && replayable(init?.body)) {
        if (csrfToken === token) invalidateCsrfToken()
        return send(true)
      }
      if (response.status === 401 && session === sessionGeneration) {
        if (path === '/api/me') invalidateCsrfToken() // AuthSession establishes the identity boundary.
        else if (!expiredSession) {
          // Let an already pending /api/me finish and establish the confirmed identity.
          // Advancing its session generation here would turn an anonymous result into an error.
          invalidateCsrfToken(); clearReadCache(); remoteCache.clear(); expiredSession = true
          expirationListeners.forEach(listener => listener())
        }
      }
      throw error
    }
    const changed = () => {
      if (mutation && !readOnly) { clearReadCache(); remoteCache.invalidate() }
    }
    if (response.status === 204) { changed(); return undefined as T }
    let result: T
    try { result = await response.json() as T }
    catch {
      transportSignal?.throwIfAborted()
      requireSameSession()
      throw new ApiError({ status: response.status, code: 'INVALID_RESPONSE', message: '서버 응답 형식을 확인하지 못했습니다.' })
    }
    requireSameSession()
    changed()
    return result
  }
  init.signal?.throwIfAborted()
  if (!cacheable) return send(false)
  if (fresh) forgetRead(key)
  // Browser 'no-store' still applies to HTTP storage; in-app session reuse is separate.
  const result = await waitForRead(cachedRead(key, () => send(false)), init.signal)
  requireSameSession()
  return result
}

function retryablePublicRead(error: unknown) {
  if (error instanceof ApiError) return [502, 503, 504].includes(error.status)
  return error instanceof TypeError || (error instanceof DOMException && ['AbortError', 'TimeoutError'].includes(error.name))
}

function waitForColdStartRetry(signal?: AbortSignal | null) {
  if (!signal) return new Promise<void>(resolve => setTimeout(resolve, COLD_START_RETRY_DELAY_MS))
  signal.throwIfAborted()
  return new Promise<void>((resolve, reject) => {
    const done = () => { signal.removeEventListener('abort', aborted); resolve() }
    const aborted = () => { clearTimeout(timer); reject(signal.reason) }
    const timer = setTimeout(done, COLD_START_RETRY_DELAY_MS)
    signal.addEventListener('abort', aborted, { once: true })
  })
}

/** Retry one idempotent public read when Render is still waking up. */
export async function publicRead<T>(path: string, init?: ApiRequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase()
  if (!['GET', 'HEAD'].includes(method)) throw new Error('publicRead는 읽기 요청에만 사용할 수 있습니다.')
  const { signal: callerSignal, ...request } = init ?? {}
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try { return await api<T>(path, { ...request, method, signal: callerSignal, timeoutMs: COLD_START_API_TIMEOUT_MS }) }
    catch (error) {
      if (attempt === 1 || callerSignal?.aborted || !retryablePublicRead(error)) throw error
      await waitForColdStartRetry(callerSignal)
    }
  }
  throw new Error('공개 정보를 불러오지 못했습니다.')
}

export { API_BASE_URL }
