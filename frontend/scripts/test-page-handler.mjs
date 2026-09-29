import assert from 'node:assert/strict'
import { chdir } from 'node:process'
import handler from '../api/page.mjs'

const headers = new Map()
let body = ''
const response = {
  statusCode: 0,
  setHeader(name, value) { headers.set(name.toLowerCase(), value) },
  end(value) { body = value ?? '' },
}

const originalDirectory = process.cwd()
const environmentKeys = ['PUBLIC_SITE_URL', 'CATEGORY_SITES_ENABLED', 'SEO_API_BASE_URL', 'VITE_API_BASE_URL']
const originalEnvironment = new Map(environmentKeys.map(key => [key, process.env[key]]))
try {
  chdir('..')
  // Check both rollout states regardless of the hosting project's environment.
  // This smoke test verifies the packaged template, not the live API.
  process.env.PUBLIC_SITE_URL = 'https://boothana.kr'
  process.env.SEO_API_BASE_URL = ''
  process.env.VITE_API_BASE_URL = ''
  for (const enabled of [false, true]) {
    process.env.CATEGORY_SITES_ENABLED = String(enabled)
    headers.clear()
    await handler({ method: 'GET', headers: { host: 'boothana.kr' }, query: { path: '/' }, url: '/' }, response)
    assert.equal(response.statusCode, 200)
    assert.match(headers.get('content-type'), /text\/html/)
    assert.match(body, /<div id="root"><main[^>]+data-seo-fallback/)
    assert.match(body, enabled ? /어떤 행사를 찾고 계세요\?/ : /서울·경기 행사와 참가 부스 찾기/)
    if (enabled) {
      for (const category of ['subculture', 'expo', 'festival']) {
        assert.ok(body.includes(`href="https://${category}.boothana.kr/"`))
      }
    }
  }
} finally {
  chdir(originalDirectory)
  for (const [key, value] of originalEnvironment) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

console.log('Page handler resolves its template independently of process.cwd() in both rollout states.')
