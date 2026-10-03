import { CONSENT_KEY, type Consent } from './measurement'

const COOKIE_KEY = 'boothhana_analytics_consent_v1'
const sharedHosts = ['boothana.kr', 'subculture.boothana.kr', 'expo.boothana.kr', 'festival.boothana.kr']
// Retain the choice across layout remounts when browser storage is unavailable.
const memory = new Map<string, Exclude<Consent, null>>()
const parse = (value: string | null | undefined): Consent => value === 'granted' || value === 'denied' ? value : null
const shared = () => window.location.protocol === 'https:' && sharedHosts.includes(window.location.hostname)
function cookieConsent(): Consent {
  try { return parse(document.cookie.split(';').map(item => item.trim()).find(item => item.startsWith(`${COOKIE_KEY}=`))?.slice(COOKIE_KEY.length + 1)) }
  catch { return null }
}
function storeCookie(value: Exclude<Consent, null>) {
  try {
    document.cookie = `${COOKIE_KEY}=${value}; Max-Age=31536000; Path=/; Domain=boothana.kr; Secure; SameSite=Lax`
    return cookieConsent() === value
  } catch { return false }
}
export function saveConsent(value: Exclude<Consent, null>) {
  const cookieFailed = shared() && !storeCookie(value)
  let persisted = shared() && !cookieFailed
  try {
    // Avoid an old per-host choice reviving after the shared cookie expires.
    if (persisted) localStorage.removeItem(CONSENT_KEY)
    else {
      localStorage.setItem(CONSENT_KEY, value)
      persisted = localStorage.getItem(CONSENT_KEY) === value
    }
  } catch { /* The current tab still retains the choice. */ }
  if (persisted && !cookieFailed) memory.delete(window.location.origin)
  else memory.set(window.location.origin, value)
}
export function readConsent(): Consent {
  const temporary = memory.get(window.location.origin)
  if (temporary) return temporary
  if (shared()) {
    const value = cookieConsent()
    if (value) {
      try { localStorage.removeItem(CONSENT_KEY) } catch { /* Cookie remains authoritative. */ }
      return value
    }
  }
  try {
    const legacy = parse(localStorage.getItem(CONSENT_KEY))
    if (legacy) { saveConsent(legacy); return legacy }
  } catch { /* Storage may be blocked by the browser. */ }
  return null
}
