import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { injectMetadata, normalizePath, pageMetadata, siteOrigin } from '../seo/metadata.mjs'

const MAX_RESPONSE = 4 * 1024 * 1024
/** Configured API origin only; never request Host, user URLs, cookies or redirects. */
export function apiOrigin(raw) {
  try {
    const u = new URL(raw)
    if (u.username || u.password || u.search || u.hash || u.pathname !== '/') return ''
    if (u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname))) return u.origin
  } catch { /* invalid config */ }
  return ''
}
export async function readBoundedJson(response) {
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Unexpected API content type')
  if (Number(response.headers.get('content-length')) > MAX_RESPONSE) throw new Error('API response too large')
  const reader = response.body.getReader(); const chunks = []; let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break
      size += value.length
      if (size > MAX_RESPONSE) { await reader.cancel(); throw new Error('API response too large') }
      chunks.push(Buffer.from(value))
    }
  } finally { reader.releaseLock() }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}
export async function renderPage({ path, search = '', template, siteUrl, apiBase, fetcher = fetch }) {
  path = normalizePath(path)
  let catalog = null, unavailable = false, status = 200
  const match = /^\/discover\/([1-9]\d*)$/.exec(path)
  if (match) {
    const origin = apiOrigin(apiBase)
    if (!origin || !Number.isSafeInteger(Number(match[1]))) { unavailable = true; status = 503 }
    else {
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 4000)
      try {
        const response = await fetcher(`${origin}/api/public/catalog/events/${match[1]}`, {
          signal: controller.signal, redirect: 'error', credentials: 'omit', headers: { Accept: 'application/json' },
        })
        if (!response.ok) { unavailable = true; status = response.status === 404 || response.status === 410 ? 404 : 503 }
        else {
          catalog = await readBoundedJson(response)
          if (Number(catalog?.id) !== Number(match[1]) || typeof catalog?.event?.name !== 'string' || !catalog.event.name.trim()) throw new Error('Invalid public event')
        }
      } catch { catalog = null; unavailable = true; status = 503 }
      finally { clearTimeout(timer) }
    }
  }
  if (path === '/not-found') status = 404
  const meta = pageMetadata({ path, search, siteUrl, catalog, unavailable })
  return { status, meta, html: injectMetadata(template, meta) }
}
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  // Do not retain event titles/images after an unpublish or rights revocation.
  res.setHeader('Cache-Control', 'private, no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); res.statusCode = 405; res.end(); return }
  try {
    const raw = Array.isArray(req.query?.path) ? '' : req.query?.path
    const request = new URL(req.url || '/', 'https://request.invalid')
    const path = normalizePath(typeof raw === 'string' ? '/' + raw.replace(/^\//, '') : request.pathname)
    const search = new URLSearchParams(request.search)
    search.delete('path') // framework routing parameter is not a user-visible search filter
    const siteUrl = siteOrigin(process.env.PUBLIC_SITE_URL || '')
    const template = await readFile(join(process.cwd(), 'seo-template', 'index.html'), 'utf8')
    const page = await renderPage({ path, search: search.toString(), template, siteUrl, apiBase: process.env.SEO_API_BASE_URL || process.env.VITE_API_BASE_URL || '' })
    res.statusCode = page.status
    res.setHeader('X-Robots-Tag', page.meta.robots)
    if (page.status === 503) res.setHeader('Retry-After', '60')
    res.end(req.method === 'HEAD' ? undefined : page.html)
  } catch {
    // Missing build/config never becomes a false successful SEO response.
    res.statusCode = 503; res.setHeader('X-Robots-Tag', 'noindex'); res.end(req.method === 'HEAD' ? undefined : '서비스 준비 상태를 확인하고 있습니다.')
  }
}
