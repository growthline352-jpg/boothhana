import { CONSENT_KEY, type Consent } from './measurement'

const COOKIE_KEY = 'boothhana_analytics_consent_v1'
const sharedHosts = ['boothana.kr', 'subculture.boothana.kr', 'expo.boothana.kr', 'festival.boothana.kr']
type Saved = { value: Exclude<Consent, null>; updatedAt: number }
const memory = new Map<string, Saved>()
const parse = (value: unknown): Consent => value === 'granted' || value === 'denied' ? value : null
const shared = () => window.location.protocol === 'https:' && sharedHosts.includes(window.location.hostname)
function saved(value: unknown, updatedAt: unknown): Saved | null {
  const choice = parse(value)
  return choice && typeof updatedAt === 'number' && Number.isSafeInteger(updatedAt) && updatedAt >= 0 ? { value: choice, updatedAt } : null
}
function cookieConsent(): Saved | null {
  try {
    const raw = document.cookie.split(';').map(item => item.trim()).find(item => item.startsWith(`${COOKIE_KEY}=`))?.slice(COOKIE_KEY.length + 1)
    if (!raw) return null
    const [value, timestamp, extra] = raw.split('.')
    return extra === undefined ? saved(value, timestamp === undefined ? 0 : Number(timestamp)) : null
  } catch { return null }
}
function localConsent(): Saved | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY)
    const legacy = parse(raw)
    if (legacy) return { value: legacy, updatedAt: 0 }
    const record = JSON.parse(raw ?? 'null')
    return record ? saved(record.value, record.updatedAt) : null
  } catch { return null }
}
function newest(a: Saved | null, b: Saved | null): Saved | null {
  if (!a) return b
  if (!b) return a
  if (a.updatedAt === b.updatedAt) return a.value === 'denied' ? a : b
  return a.updatedAt > b.updatedAt ? a : b
}
function persist(record: Saved) {
  let cookieStored = false
  if (shared()) try {
    document.cookie = `${COOKIE_KEY}=${record.value}.${record.updatedAt}; Max-Age=31536000; Path=/; Domain=boothana.kr; Secure; SameSite=Lax`
    const stored = cookieConsent()
    cookieStored = stored?.value === record.value && stored.updatedAt === record.updatedAt
  } catch { /* Use the origin's storage or current tab instead. */ }
  let localStored = false
  try {
    if (cookieStored) localStorage.removeItem(CONSENT_KEY)
    else {
      localStorage.setItem(CONSENT_KEY, JSON.stringify(record))
      const stored = localConsent()
      localStored = stored?.value === record.value && stored.updatedAt === record.updatedAt
    }
  } catch { /* A choice still applies to this tab when all storage is blocked. */ }
  if (cookieStored || localStored) memory.delete(window.location.origin)
  else memory.set(window.location.origin, record)
}
export function saveConsent(value: Exclude<Consent, null>) {
  const previous = newest(shared() ? cookieConsent() : null, newest(localConsent(), memory.get(window.location.origin) ?? null))
  persist({ value, updatedAt: Math.max(Date.now(), (previous?.updatedAt ?? 0) + 1) })
}
export function readConsent(): Consent {
  const cookie = shared() ? cookieConsent() : null
  const local = localConsent()
  const temporary = memory.get(window.location.origin) ?? null
  // A timestamped fallback can be newer than an existing, unwritable cookie.
  // Legacy per-host values have no timestamp: the shared choice takes priority.
  const fallback = cookie && local?.updatedAt === 0 ? temporary : newest(local, temporary)
  const latest = newest(cookie, fallback)
  if (!latest) return null
  if (latest === cookie) {
    memory.delete(window.location.origin)
    try { localStorage.removeItem(CONSENT_KEY) } catch { /* Shared choice remains authoritative. */ }
  } else if (shared()) {
    persist(latest.updatedAt === 0 ? { ...latest, updatedAt: Date.now() } : latest)
  }
  return latest.value
}
