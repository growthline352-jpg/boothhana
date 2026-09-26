import type { AuthSnapshot } from './AuthSession'

export interface DraftLease { readonly epoch: number; readonly scope: string; readonly key: string }
interface DraftEntry { value: unknown; pending: boolean; error: string; message: string }

/** Account-scoped TAB MEMORY only. Never localStorage, sessionStorage, or a public cache.
 * An identity lookup locks reads/writes; an identity/permission change destroys the old epoch.
 * Outstanding saves keep their lock across editor unmounts to prevent duplicate creates.
 */
export class ConsoleDraftStore {
  private epoch = 0
  private scope = ''
  private unlocked = false
  private version = 0
  private entries = new Map<string, DraftEntry>()
  private listeners = new Set<() => void>()
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  getVersion = () => this.version
  private changed() { this.version++; this.listeners.forEach(listener => listener()) }
  observe(snapshot: AuthSnapshot) {
    if (snapshot.status === 'authenticated' && snapshot.user) {
      const scope = `${snapshot.user.id}:${[...snapshot.user.permissions].sort().join(',')}`
      if (scope !== this.scope) { this.epoch++; this.entries.clear(); this.scope = scope }
      this.unlocked = true
    } else if (snapshot.status === 'anonymous') { this.reset(); return }
    else this.unlocked = false
    this.changed()
  }
  reset = () => { this.epoch++; this.scope = ''; this.unlocked = false; this.entries.clear(); this.changed() }
  lease(key: string): DraftLease | null {
    return this.unlocked && this.scope ? { epoch: this.epoch, scope: this.scope, key } : null
  }
  private owns(lease: DraftLease | null): lease is DraftLease {
    return !!lease && lease.epoch === this.epoch && lease.scope === this.scope
  }
  canUse = (lease: DraftLease | null) => this.unlocked && this.owns(lease)
  read<T>(lease: DraftLease | null, initial: T): T {
    if (!this.canUse(lease)) return initial
    const entry = this.entries.get(lease!.key)
    return entry && entry.value !== undefined ? entry.value as T : initial
  }
  status(lease: DraftLease | null) {
    const entry = this.canUse(lease) ? this.entries.get(lease!.key) : undefined
    return { pending: entry?.pending ?? false, error: entry?.error ?? '', message: entry?.message ?? '' }
  }
  private entry(lease: DraftLease): DraftEntry {
    let entry = this.entries.get(lease.key)
    if (!entry) { entry = { value: undefined, pending: false, error: '', message: '' }; this.entries.set(lease.key, entry) }
    return entry
  }
  set<T>(lease: DraftLease | null, value: T): boolean {
    if (!this.canUse(lease)) return false
    const entry = this.entry(lease!)
    if (entry.pending) return false
    entry.value = value; entry.error = ''; entry.message = ''; this.changed(); return true
  }
  begin(lease: DraftLease | null): boolean {
    if (!this.canUse(lease)) return false
    const entry = this.entry(lease!)
    if (entry.pending) return false
    entry.pending = true; entry.error = ''; entry.message = ''; this.changed(); return true
  }
  /** Server acknowledgement may arrive during revalidation. Never write into a later account epoch. */
  saved(lease: DraftLease | null) {
    if (!this.owns(lease)) return
    const entry = this.entry(lease); entry.value = undefined; entry.error = ''
    entry.message = '저장이 완료되었습니다. 목록에서 결과를 확인해 주세요.'; this.changed()
  }
  failed(lease: DraftLease | null, error: string) {
    if (!this.owns(lease)) return
    this.entry(lease).error = error; this.changed()
  }
  finish(lease: DraftLease | null) {
    if (!this.owns(lease)) return
    this.entry(lease).pending = false; this.changed()
  }
}
