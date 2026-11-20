import { expect, test } from 'vitest'
import { previewRoute } from './preview-public.mjs'

test('local preview serves public reads but blocks operating data writes', () => {
  expect(previewRoute('GET', '/api/public/catalog/events/1')).toBe('public')
  expect(previewRoute('HEAD', '/api/public/catalog/events/1')).toBe('public')
  expect(previewRoute('GET', '/api/me')).toBe('guest')
  expect(previewRoute('POST', '/api/public/catalog/events/1')).toBe('blocked')
  expect(previewRoute('DELETE', '/api/me/catalog/events/1/comments/123')).toBe('blocked')
  expect(previewRoute('GET', '/api/admin/events')).toBe('blocked')
  expect(previewRoute('GET', '/discover/1')).toBe('site')
})
