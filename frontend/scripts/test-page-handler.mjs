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
try {
  chdir('..')
  await handler({ method: 'GET', query: { path: '/' }, url: '/' }, response)
} finally {
  chdir(originalDirectory)
}

assert.equal(response.statusCode, 200)
assert.match(headers.get('content-type'), /text\/html/)
assert.match(body, /<div id="root"><main[^>]+data-seo-fallback/)
assert.match(body, /서울·경기 행사와 참가 부스 찾기/)
console.log('Page handler resolves its template independently of process.cwd().')
