import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pathToFileURL } from 'node:url'

const port = Number(process.env.LOCAL_PREVIEW_PORT || 4186)
const siteOrigin = process.env.LOCAL_PREVIEW_SITE_ORIGIN || 'http://127.0.0.1:4185'
const publicApiOrigin = process.env.LOCAL_PREVIEW_PUBLIC_API_ORIGIN || 'https://api.boothana.kr'

export function previewRoute(method, pathname) {
  if (pathname === '/api/me' && method === 'GET') return 'guest'
  if (pathname.startsWith('/api/')) return ['GET', 'HEAD'].includes(method) && pathname.startsWith('/api/public/') ? 'public' : 'blocked'
  return ['GET', 'HEAD'].includes(method) ? 'site' : 'blocked'
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

export function startPreviewProxy() {
  return createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    const route = previewRoute(req.method || 'GET', url.pathname)
    if (route === 'guest') return json(res, 401, { status: 401, code: 'UNAUTHORIZED', message: '로컬 미리보기에서는 로그인할 수 없습니다.' })
    if (route === 'blocked') return json(res, 403, { status: 403, code: 'PREVIEW_READ_ONLY', message: '로컬 미리보기에서는 운영 데이터 변경을 허용하지 않습니다.' })
    try {
      const origin = route === 'public' ? publicApiOrigin : siteOrigin
      const upstream = await fetch(new URL(url.pathname + url.search, origin), {
        method: req.method,
        headers: { accept: req.headers.accept || '*/*' },
        redirect: 'manual',
        signal: AbortSignal.timeout(90_000),
      })
      const headers = Object.fromEntries([...upstream.headers].filter(([key]) => ![
        'connection', 'content-encoding', 'content-length', 'set-cookie', 'transfer-encoding',
      ].includes(key)))
      res.writeHead(upstream.status, headers)
      if (!upstream.body || req.method === 'HEAD') return res.end()
      Readable.fromWeb(upstream.body).pipe(res)
    } catch {
      json(res, 502, { status: 502, code: 'PREVIEW_UPSTREAM_UNAVAILABLE', message: '미리보기 데이터 서버에 연결하지 못했습니다.' })
    }
  }).listen(port, '127.0.0.1', () => console.log(`Read-only preview: http://127.0.0.1:${port}`))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) startPreviewProxy()
