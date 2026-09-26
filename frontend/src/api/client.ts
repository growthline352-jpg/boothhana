import type { ApiErrorBody } from '../types'

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

function invalidateCsrfToken() {
  csrfGeneration += 1
  csrfToken = null
  csrfRequest = null
}

export function resetCsrfToken() {
  sessionGeneration += 1
  invalidateCsrfToken()
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

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase()
  const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(method)
  const session = sessionGeneration
  const requireSameSession = () => {
    if (mutation && session !== sessionGeneration) throw new ApiError({
      status: 409, code: 'SESSION_CHANGED',
      message: '로그인 상태가 변경되어 이전 요청의 전송·재시도 또는 결과 반영을 중단했습니다. 이미 전송한 요청의 처리 결과는 다시 확인해 주세요.',
    })
  }
  async function send(retried: boolean): Promise<T> {
    init?.signal?.throwIfAborted()
    requireSameSession()
    const token = mutation ? await ensureCsrfToken() : null
    init?.signal?.throwIfAborted()
    requireSameSession()
    const headers = new Headers(init?.headers)
    if (init?.body != null && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }
    if (token) headers.set('X-XSRF-TOKEN', token)
    const signal = init?.signal ?? AbortSignal.timeout(DEFAULT_API_TIMEOUT_MS)
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
      if (response.status === 401 && session === sessionGeneration) resetCsrfToken()
      throw error
    }
    if (response.status === 204) return undefined as T
    let result: T
    try { result = await response.json() as T }
    catch {
      init?.signal?.throwIfAborted()
      requireSameSession()
      throw new ApiError({ status: response.status, code: 'INVALID_RESPONSE', message: '서버 응답 형식을 확인하지 못했습니다.' })
    }
    requireSameSession()
    return result
  }
  return send(false)
}

export { API_BASE_URL }
