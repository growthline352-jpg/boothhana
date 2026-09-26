const { test } = require('node:test'), assert = require('node:assert/strict')
const { load } = require('./load_source.cjs')
const { ConsoleDraftStore } = load('frontend/src/app/ConsoleDraftStore.ts')
const { AuthSession } = load('frontend/src/app/AuthSession.ts')
const user = (id = 1, permissions = ['ADMIN', 'CREATOR']) => ({ id, permissions, displayName: `[TEST] ${id}` })
const snap = (status, u = null) => ({ status, user: u, generation: 1, error: '' })
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const setup = () => { const store = new ConsoleDraftStore(); store.observe(snap('authenticated', user())); return store }
test('same-account remount restores the latest draft for each editor', () => {
  for (const key of ['admin:event:new', 'admin:event:4', 'creator:products:9', 'creator:booths']) {
    const s = setup(), a = s.lease(key); s.set(a, { name: 'PRIVATE latest', version: 4 })
    s.observe(snap('checking')); assert.equal(s.read(a, null), null); assert.equal(s.lease(key), null)
    assert.equal(s.set(a, { name: 'bad' }), false); assert.equal(s.begin(a), false)
    s.observe(snap('authenticated', user()))
    assert.deepEqual(s.read(s.lease(key), null), { name: 'PRIVATE latest', version: 4 })
  }
})
test('lookup failure locks drafts without becoming logout', () => {
  const s = setup(), a = s.lease('a'); s.set(a, 'PRIVATE'); s.observe(snap('error'))
  assert.equal(s.read(a, ''), ''); s.observe(snap('authenticated', user())); assert.equal(s.read(s.lease('a'), ''), 'PRIVATE')
})
test('account switch and A-B-A permanently invalidate old leases', () => {
  const s = setup(), a = s.lease('a'); s.set(a, 'PRIVATE A'); s.observe(snap('authenticated', user(2)))
  assert.equal(s.read(s.lease('a'), ''), ''); s.observe(snap('authenticated', user(1)))
  assert.equal(s.read(s.lease('a'), ''), ''); assert.equal(s.set(a, 'stale'), false)
  s.failed(a, 'stale error'); s.saved(a); assert.equal(s.status(s.lease('a')).message, '')
})
test('changed permissions discard privileged drafts even for the same numeric user id', () => {
  const s = setup(), a = s.lease('a'); s.set(a, 'PRIVATE'); s.observe(snap('authenticated', user(1, ['CREATOR'])))
  assert.equal(s.read(s.lease('a'), null), null); assert.equal(s.canUse(a), false)
})
test('ordering of unchanged permissions does not invalidate a draft', () => {
  const s = setup(); s.set(s.lease('a'), 'KEEP'); s.observe(snap('authenticated', user(1, ['CREATOR', 'ADMIN'])))
  assert.equal(s.read(s.lease('a'), null), 'KEEP')
})
test('confirmed anonymous and explicit reset destroy drafts', () => {
  for (const reset of [s => s.observe(snap('anonymous')), s => s.reset()]) {
    const s = setup(); s.set(s.lease('a'), 'PRIVATE'); reset(s); s.observe(snap('authenticated', user()))
    assert.equal(s.read(s.lease('a'), null), null)
  }
})
test('pending saves remain single-flight through checking and remount', () => {
  const s = setup(), a = s.lease('a'); s.set(a, { name: 'pending' }); assert.equal(s.begin(a), true)
  s.observe(snap('checking')); s.observe(snap('authenticated', user()))
  const b = s.lease('a'); assert.equal(s.status(b).pending, true); assert.equal(s.begin(b), false)
  assert.equal(s.set(b, { name: 'overwrite' }), false); s.saved(a); s.finish(a)
  assert.equal(s.read(b, null), null); assert.equal(s.status(b).pending, false); assert.match(s.status(b).message, /저장이 완료/)
})
test('save acknowledgement during checking clears stale draft; failures preserve it', () => {
  const s = setup(), a = s.lease('a'); s.set(a, 'DRAFT'); s.begin(a); s.observe(snap('checking'))
  s.failed(a, '503'); s.finish(a); s.observe(snap('authenticated', user()))
  assert.equal(s.read(s.lease('a'), ''), 'DRAFT'); assert.equal(s.status(s.lease('a')).error, '503')
  s.begin(a); s.observe(snap('checking')); s.saved(a); s.finish(a); s.observe(snap('authenticated', user()))
  assert.equal(s.read(s.lease('a'), null), null)
})
test('draft keys isolate separate events and booths', () => {
  const s = setup(); s.set(s.lease('admin:event:1'), 'ONE'); s.set(s.lease('admin:event:2'), 'TWO')
  assert.equal(s.read(s.lease('admin:event:1'), ''), 'ONE'); assert.equal(s.read(s.lease('creator:products:1'), null), null)
})
test('actual AuthSession drives draft lock/recovery in sync with identity transitions', async () => {
  let request = null; const a = new AuthSession(() => request ? request.promise : Promise.resolve(user()), async () => {})
  await a.refresh(); const lease = a.drafts.lease('a'); a.drafts.set(lease, 'PRIVATE')
  request = deferred(); const pending = a.refresh(); assert.equal(a.read().user, null); assert.equal(a.drafts.read(lease, null), null)
  request.resolve(user()); await pending; assert.equal(a.drafts.read(a.drafts.lease('a'), ''), 'PRIVATE')
})
test('failed explicit logout still discards the draft before a later login', async () => {
  const a = new AuthSession(async () => user(), async () => { throw Error('offline') }); await a.refresh()
  a.drafts.set(a.drafts.lease('a'), 'PRIVATE'); await assert.rejects(a.logout()); await a.refresh()
  assert.equal(a.drafts.read(a.drafts.lease('a'), null), null)
})
test('session cancel discards draft and delayed response cannot restore it', async () => {
  const a = new AuthSession(async () => user(), async () => {}); await a.refresh(); const lease = a.drafts.lease('a')
  a.drafts.set(lease, 'PRIVATE'); a.cancel(); assert.equal(a.drafts.canUse(lease), false)
  await a.refresh(); assert.equal(a.drafts.read(a.drafts.lease('a'), null), null)
})
