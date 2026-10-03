import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CONSENT_KEY } from './measurement'

const key = 'boothhana_analytics_consent_v1'
let host: string, cookie: string, blocked: boolean
let stores: Map<string, Map<string, string>>
let assignments: string[]
let readConsent: typeof import('./consent').readConsent
let saveConsent: typeof import('./consent').saveConsent
const local = () => {
  if (!stores.has(host)) stores.set(host, new Map())
  return stores.get(host)!
}
beforeEach(async () => {
  vi.resetModules()
  host = 'subculture.boothana.kr'; cookie = ''; blocked = false; stores = new Map(); assignments = []
  vi.stubGlobal('window', { location: {
    protocol: 'https:', get hostname() { return host }, get origin() { return `https://${host}` },
  } })
  vi.stubGlobal('document', {
    get cookie() { return cookie },
    set cookie(value: string) { assignments.push(value); if (!blocked) cookie = value.split(';')[0] },
  })
  vi.stubGlobal('localStorage', {
    getItem: (name: string) => local().get(name) ?? null,
    setItem: (name: string, value: string) => { local().set(name, value) },
    removeItem: (name: string) => { local().delete(name) },
  })
  ;({ readConsent, saveConsent } = await import('./consent'))
})
afterEach(() => { vi.unstubAllGlobals() })
it('starts without a choice and never implicitly grants analytics', () => {
  expect(readConsent()).toBeNull()
  cookie = `${key}=invalid`
  local().set(CONSENT_KEY, 'invalid')
  expect(readConsent()).toBeNull()
})
it.each(['granted', 'denied'] as const)('retains %s across all four sites and reloads', async value => {
  saveConsent(value)
  expect(assignments[0]).toContain('Max-Age=31536000; Path=/; Domain=boothana.kr; Secure; SameSite=Lax')
  for (host of ['boothana.kr', 'subculture.boothana.kr', 'expo.boothana.kr', 'festival.boothana.kr']) {
    // New module simulates a fresh page/tab rather than relying on memory.
    vi.resetModules()
    expect((await import('./consent')).readConsent()).toBe(value)
  }
})
it('migrates an existing denial and removes the legacy origin choice', () => {
  local().set(CONSENT_KEY, 'denied')
  expect(readConsent()).toBe('denied')
  expect(cookie).toBe(`${key}=denied`)
  expect(local().has(CONSENT_KEY)).toBe(false)
})
it('shared withdrawal wins over a stale grant in another host', () => {
  saveConsent('granted')
  host = 'expo.boothana.kr'; local().set(CONSENT_KEY, 'granted')
  host = 'subculture.boothana.kr'; saveConsent('denied')
  host = 'expo.boothana.kr'
  expect(readConsent()).toBe('denied')
  expect(local().has(CONSENT_KEY)).toBe(false)
})
it('an explicit new choice replaces a previous shared choice', () => {
  saveConsent('denied'); saveConsent('granted')
  expect(readConsent()).toBe('granted')
})
it('does not revive old stored consent after expiry on a fresh visit', async () => {
  local().set(CONSENT_KEY, 'granted'); readConsent()
  cookie = ''; vi.resetModules()
  expect((await import('./consent')).readConsent()).toBeNull()
})
it('clearing saved consent also resets it in the current tab', () => {
  saveConsent('granted'); cookie = ''
  expect(readConsent()).toBeNull()
})
it('retains choices when cookies are blocked, even across reloads', async () => {
  blocked = true; saveConsent('denied')
  vi.resetModules()
  expect((await import('./consent')).readConsent()).toBe('denied')
})
it('honors withdrawal in the current tab even when an existing cookie cannot be overwritten', () => {
  saveConsent('granted'); blocked = true; saveConsent('denied')
  expect(readConsent()).toBe('denied')
})
it('retains a choice during remounts when all storage is blocked', () => {
  blocked = true
  vi.stubGlobal('localStorage', {
    getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') },
  })
  saveConsent('denied')
  expect(readConsent()).toBe('denied')
})
it('does not share production choices with a preview host', () => {
  saveConsent('granted'); host = 'preview.vercel.app'
  expect(readConsent()).toBeNull()
  saveConsent('denied')
  expect(cookie).toBe(`${key}=granted`)
})
