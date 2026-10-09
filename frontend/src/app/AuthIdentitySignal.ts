/** A signal is only a hint to verify /api/me; it never establishes identity or permissions. */
export class AuthIdentitySignal {
  private seen: string
  private read: () => string
  private write: (value: string) => void
  private changed: () => void
  constructor(read: () => string, write: (value: string) => void, changed: () => void) {
    this.read = read; this.write = write; this.changed = changed
    this.seen = read()
  }
  observe(value: string) {
    this.seen = value
    if (this.read() !== value) this.write(value)
  }
  check = () => {
    const value = this.read()
    if (!value || value === this.seen) return
    this.seen = value
    this.changed()
  }
}

const key = 'boothhana_identity_v1'
export function readIdentitySignal() {
  const value = document.cookie.split('; ').find(cookie => cookie.startsWith(key + '='))?.slice(key.length + 1) || ''
  return /^[a-f0-9]{64}$/.test(value) ? value : ''
}
export function writeIdentitySignal(value: string) {
  const shared = /^(?:subculture\.|expo\.|festival\.|popup\.)?boothana\.kr$/.test(location.hostname)
  document.cookie = `${key}=${value}; Path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}${shared ? '; Domain=boothana.kr' : ''}`
  try { localStorage.setItem(key, value) } catch { /* Focus checks also work with cookies only. */ }
}
export function listenIdentitySignal(check: () => void) {
  const visible = () => { if (document.visibilityState === 'visible') check() }
  const stored = (event: StorageEvent) => { if (event.key === key) check() }
  window.addEventListener('focus', check)
  window.addEventListener('pageshow', check)
  document.addEventListener('visibilitychange', visible)
  window.addEventListener('storage', stored)
  return () => {
    window.removeEventListener('focus', check); window.removeEventListener('pageshow', check)
    document.removeEventListener('visibilitychange', visible); window.removeEventListener('storage', stored)
  }
}
export async function identityFingerprint(identity: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity)))
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
}
