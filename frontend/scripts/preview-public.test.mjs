import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { previewRoute } from './preview-public.mjs'

test('local preview serves public reads but blocks operating data writes', () => {
  assert.equal(previewRoute('GET', '/api/public/catalog/events/1'), 'public')
  assert.equal(previewRoute('HEAD', '/api/public/catalog/events/1'), 'public')
  assert.equal(previewRoute('GET', '/api/me'), 'guest')
  assert.equal(previewRoute('POST', '/api/public/catalog/events/1'), 'blocked')
  assert.equal(previewRoute('DELETE', '/api/me/catalog/events/1/comments/123'), 'blocked')
  assert.equal(previewRoute('GET', '/api/admin/events'), 'blocked')
  assert.equal(previewRoute('GET', '/discover/1'), 'site')
})
