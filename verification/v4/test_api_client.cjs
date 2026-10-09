/** Run with: node verification/test_api_client.cjs
 * Requires TypeScript installed (normally supplied by the existing frontend).
 * Executes the actual patched API client after TS->JS transpilation.
 * Only the Vite env expression is replaced for this isolated test runtime.
 * Fetch is mocked; this is not a real OAuth/server/browser integration test.
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const cp = require('node:child_process')
const {prepareApiClient}=require('./load_api_client.cjs')
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'boothhana-api-test-'))
const root=path.resolve(__dirname,'../..')
let sequence = 0
const fresh = () => import(pathToFileURL(prepareApiClient(root,path.join(dir,String(++sequence)),'https://api.test')).href)
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const empty = () => new Response(null, { status: 204 })
const originalFetch = global.fetch
const tests = []
const test = (name, fn) => tests.push([name, fn])

test('GET has credentials and no unnecessary CSRF/Content-Type', async () => {
  const calls = []
  global.fetch = async (url, init) => { calls.push([url, init]); return response({ ok: true }) }
  const { api } = await fresh()
  assert.deepEqual(await api('/public'), { ok: true })
  assert.equal(calls.length, 1)
  assert.equal(calls[0][1].credentials, 'include')
  assert.equal(calls[0][1].headers.has('Content-Type'), false)
  assert.equal(calls[0][1].headers.has('X-XSRF-TOKEN'), false)
})
test('concurrent mutations share one CSRF request', async () => {
  let tokens = 0, writes = 0
  global.fetch = async (url, init) => {
    if (url.endsWith('/api/auth/csrf')) { tokens++; await new Promise(resolve => setTimeout(resolve, 5)); return response({ token: 'A' }) }
    writes++; assert.equal(init.headers.get('X-XSRF-TOKEN'), 'A'); return empty()
  }
  const { api } = await fresh()
  await Promise.all([api('/one', { method: 'POST' }), api('/two', { method: 'PATCH', body: '{}' })])
  assert.equal(tokens, 1); assert.equal(writes, 2)
})
test('explicit CSRF rejection refreshes and retries exactly once', async () => {
  let tokens = 0, writes = 0
  global.fetch = async (url, init) => {
    if (url.endsWith('/api/auth/csrf')) return response({ token: `T${++tokens}` })
    writes++
    if (writes === 1) return response({ code: 'CSRF_INVALID', message: 'refresh' }, 403)
    assert.equal(init.headers.get('X-XSRF-TOKEN'), 'T2')
    return response({ saved: true })
  }
  const { api } = await fresh()
  assert.deepEqual(await api('/write', { method: 'POST', body: '{}' }), { saved: true })
  assert.equal(tokens, 2); assert.equal(writes, 2)
})
test('a second CSRF rejection is surfaced, without infinite retry', async () => {
  let tokens = 0, writes = 0
  global.fetch = async url => {
    if (url.endsWith('/api/auth/csrf')) return response({ token: `T${++tokens}` })
    writes++; return response({ code: 'CSRF_INVALID', message: 'blocked' }, 403)
  }
  const { api, ApiError } = await fresh()
  await assert.rejects(api('/write', { method: 'POST', body: '{}' }), e => e instanceof ApiError && e.code === 'CSRF_INVALID')
  assert.equal(tokens, 2); assert.equal(writes, 2)
})
test('authorization 403 is never automatically retried', async () => {
  let writes = 0
  global.fetch = async url => {
    if (url.endsWith('/api/auth/csrf')) return response({ token: 'A' })
    writes++; return response({ code: 'FORBIDDEN', message: 'no permission' }, 403)
  }
  const { api } = await fresh()
  await assert.rejects(api('/write', { method: 'POST' }), e => e.status === 403 && e.code === 'FORBIDDEN')
  assert.equal(writes, 1)
})
test('network failure of a mutation is never automatically retried', async () => {
  let writes = 0
  global.fetch = async url => {
    if (url.endsWith('/api/auth/csrf')) return response({ token: 'A' })
    writes++; throw new TypeError('network unavailable')
  }
  const { api } = await fresh()
  await assert.rejects(api('/write', { method: 'POST' }), /network unavailable/)
  assert.equal(writes, 1)
})
test('401 clears cached CSRF state and blocks writes until identity is reconfirmed', async () => {
  let tokens = 0, writes = 0
  global.fetch = async url => {
    if (url.endsWith('/api/auth/csrf')) return response({ token: `T${++tokens}` })
    if (++writes === 1) return response({ code: 'UNAUTHORIZED', message: 'login' }, 401)
    return empty()
  }
  const { api, resetCsrfToken } = await fresh()
  await assert.rejects(api('/write', { method: 'POST' }), e => e.status === 401)
  await assert.rejects(api('/write', { method: 'POST' }), e => e.code === 'SESSION_CHANGED')
  assert.equal(tokens,1);assert.equal(writes,1)
  // AuthProvider calls this only after a confirmed account boundary or recovery.
  resetCsrfToken()
  await api('/write', { method: 'POST' })
  assert.equal(tokens, 2); assert.equal(writes, 2)
})
test('Headers objects and custom content types are preserved', async () => {
  global.fetch = async (url, init) => {
    if (url.endsWith('/api/auth/csrf')) return response({ token: 'A' })
    assert.equal(init.headers.get('Content-Type'), 'text/plain')
    assert.equal(init.headers.get('X-Custom'), 'value')
    return empty()
  }
  const { api } = await fresh()
  await api('/write', { method: 'POST', body: 'text', headers: new Headers({ 'Content-Type': 'text/plain', 'X-Custom': 'value' }) })
})
test('FormData does not receive a JSON Content-Type', async () => {
  global.fetch = async (url, init) => {
    if (url.endsWith('/api/auth/csrf')) return response({ token: 'A' })
    assert.equal(init.headers.has('Content-Type'), false)
    return empty()
  }
  const { api } = await fresh()
  const form = new FormData(); form.append('name', 'test')
  await api('/form', { method: 'POST', body: form })
})
test('gateway HTML error keeps the actual HTTP status', async () => {
  global.fetch = async () => new Response('<html>bad gateway</html>', { status: 502 })
  const { api } = await fresh()
  await assert.rejects(api('/read'), e => e.status === 502 && e.code === 'REQUEST_FAILED' && !!e.message)
})
test('successful non-JSON response becomes INVALID_RESPONSE', async () => {
  global.fetch = async () => new Response('<html>not JSON</html>', { status: 200 })
  const { api } = await fresh()
  await assert.rejects(api('/read'), e => e.status === 200 && e.code === 'INVALID_RESPONSE')
})
test('failed CSRF initialization can be retried by the user', async () => {
  let tokens = 0
  global.fetch = async url => {
    if (url.endsWith('/api/auth/csrf')) return ++tokens === 1 ? response({}, 503) : response({ token: 'OK' })
    return empty()
  }
  const { api } = await fresh()
  await assert.rejects(api('/write', { method: 'POST' }), e => e.status === 503)
  await api('/write', { method: 'POST' })
  assert.equal(tokens, 2)
})
test('explicit reset invalidates an already cached token', async () => {
  let tokens = 0
  global.fetch = async url => url.endsWith('/api/auth/csrf') ? response({ token: `T${++tokens}` }) : empty()
  const { api, resetCsrfToken } = await fresh()
  await api('/write', { method: 'POST' })
  resetCsrfToken()
  await api('/write', { method: 'POST' })
  assert.equal(tokens, 2)
})
test('stream bodies are not replayed after a CSRF rejection', async () => {
  let writes = 0
  global.fetch = async url => {
    if (url.endsWith('/api/auth/csrf')) return response({ token: 'A' })
    writes++; return response({ code: 'CSRF_INVALID', message: 'retry manually' }, 403)
  }
  const { api } = await fresh()
  await assert.rejects(api('/stream', { method: 'POST', body: new ReadableStream() }), e => e.code === 'CSRF_INVALID')
  assert.equal(writes, 1)
})
test('v11 correlation code is exposed without replacing the safe message',async()=>{
  const id='11111111-2222-4333-8444-555555555555';
  global.fetch=async()=>response({code:'INTERNAL_ERROR',message:'요청을 처리하지 못했습니다.',requestId:id},500);
  const {api}=await fresh();await assert.rejects(api('/failure'),e=>e.status===500&&e.requestId===id&&e.message.includes('문의 코드: '+id));
});
test('v11 response header correlation works for non-JSON proxy errors',async()=>{
  const id='11111111-2222-4333-8444-555555555555';
  global.fetch=async()=>new Response('bad gateway',{status:502,headers:{'X-Request-ID':id}});
  const {api}=await fresh();await assert.rejects(api('/failure'),e=>e.status===502&&e.requestId===id);
});
test('v11 malformed correlation identifier is ignored',async()=>{
  global.fetch=async()=>response({message:'안전한 오류',requestId:'<script>private-secret</script>'},500);
  const {api}=await fresh();await assert.rejects(api('/failure'),e=>e.requestId===undefined&&!e.message.includes('secret'));
});
;(async () => {
  let passed = 0
  try {
    for (const [name, fn] of tests) { await fn(); console.log(`PASS ${++passed}: ${name}`) }
    console.log(`PASS: ${passed} API client behavior tests (mock fetch; actual patched client).`)
  } finally { global.fetch = originalFetch; fs.rmSync(dir, { recursive: true, force: true }) }
})().catch(error => { console.error(error); process.exitCode = 1 })
