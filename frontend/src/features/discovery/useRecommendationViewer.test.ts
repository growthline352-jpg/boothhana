import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthSnapshot } from '../../app/AuthSession'

const frame = vi.hoisted(() => ({ value: undefined as unknown }))
vi.mock('react', () => ({ useState: (initial: unknown) => {
  if (frame.value === undefined) frame.value = initial
  return [frame.value, (next: unknown) => { frame.value = next }]
} }))
import { useRecommendationViewer } from './useRecommendationViewer'
const read = (status: AuthSnapshot['status'], id = 1) => useRecommendationViewer({ status,
  user: status === 'authenticated' ? { id, displayName: '회원', permissions: ['FAN'] } : null })

describe('public recommendations during identity checks', () => {
  beforeEach(() => { frame.value = undefined })
  it('waits for first identity resolution instead of requesting guest then personal results', () => {
    expect(read('checking')).toBe('pending')
    expect(read('authenticated')).toBe(1)
  })
  it('keeps the same query scope through repeated tab returns', () => {
    expect(read('authenticated')).toBe(1)
    for (let i = 0; i < 3; i++) {
      expect(read('checking')).toBe(1)
      expect(read('authenticated')).toBe(1)
    }
  })
  it('changes scope immediately when another account or logout is confirmed', () => {
    read('authenticated', 1)
    read('checking')
    expect(read('authenticated', 2)).toBe(2)
    read('checking')
    expect(read('anonymous')).toBe('guest')
  })
  it('does not discard public cards on a temporary auth lookup failure', () => {
    read('authenticated')
    read('checking')
    expect(read('error')).toBe(1)
    expect(read('authenticated')).toBe(1)
  })
  it('allows public results if initial identity lookup fails and keeps guests stable', () => {
    read('checking')
    expect(read('error')).toBe('guest')
    expect(read('checking')).toBe('guest')
    expect(read('anonymous')).toBe('guest')
  })
})
