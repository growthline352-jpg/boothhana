import { libraryApi } from './api'
import { validTarget } from './memory'
import type { MemoryTarget, ResolvedMemory } from './types'

export const PUBLIC_MEMORY_TTL_MS = 30_000
const key = (t: MemoryTarget) => `${t.eventId}:${t.type}:${t.id}:${t.participantId ?? ''}`
type Cached = { value: ResolvedMemory; until: number }
/** Current public data only. Never persists account records, notes or images. */
export class PublicMemoryCache {
  private entries = new Map<string, Cached>()
  // Coalesce per TARGET, not per array: partially overlapping pages must not race.
  private pending = new Map<string, Promise<Cached>>()
  private epoch = 0
  private readonly fetcher: typeof libraryApi.resolve
  private readonly now: () => number
  constructor(fetcher = libraryApi.resolve, now = () => Date.now()) { this.fetcher = fetcher; this.now = now }
  clear = () => { this.epoch++; this.entries.clear(); this.pending.clear() }

  resolve = async (targets: MemoryTarget[]): Promise<ResolvedMemory[]> => {
    if (targets.length > 200 || targets.some(t => !validTarget(t))) throw Error('공개 정보 조회 대상을 확인해 주세요.')
    if (!targets.length) return []
    const generation = this.epoch
    const unique = [...new Map(targets.map(t => [key(t), t])).values()]
    // Capture per-call results: another successful batch may evict these from the
    // bounded reuse cache before this call resumes. Eviction is NOT a failed fetch.
    const answers = new Map<string, Cached | Promise<Cached>>()
    const missing: MemoryTarget[] = []
    for (const t of unique) {
      const k = key(t), cached = this.entries.get(k), pending = this.pending.get(k)
      if (cached && cached.until > this.now()) answers.set(k, cached)
      else if (pending) answers.set(k, pending)
      else missing.push(t)
    }
    if (missing.length) {
      let response: Promise<ResolvedMemory[]>
      try { response = Promise.resolve(this.fetcher(missing)) }
      catch (error) { response = Promise.reject(error) }
      const batch = response.then(results => {
        if (generation !== this.epoch) throw Error('공개 정보를 다시 확인하고 있어요.')
        if (!Array.isArray(results) || results.some(r => !r || !r.target || !validTarget(r.target)))
          throw Error('공개 정보 응답을 확인하지 못했어요.')
        const received = new Map(results.map(r => [key(r.target), r]))
        if (results.length !== missing.length || received.size !== missing.length || missing.some(t => !received.has(key(t))))
          throw Error('공개 정보 응답을 확인하지 못했어요.')
        // Validate the WHOLE batch before any cache entry becomes visible.
        for (const t of missing) {
          const result = received.get(key(t))!
          if (typeof result.available !== 'boolean' || result.available && !result.current)
            throw Error('공개 정보 응답을 확인하지 못했어요.')
        }
        const until = this.now() + PUBLIC_MEMORY_TTL_MS, loaded = new Map<string, Cached>()
        for (const t of missing) {
          const result = received.get(key(t))!
          const row: Cached = { value: result.available ? result : { target: t, available: false, current: null, image: null }, until }
          loaded.set(key(t), row); this.entries.set(key(t), row)
        }
        for (const [k, row] of this.entries) if (row.until <= this.now()) this.entries.delete(k)
        while (this.entries.size > 400) this.entries.delete(this.entries.keys().next().value!)
        return loaded
      })
      for (const t of missing) {
        const k = key(t)
        const pending: Promise<Cached> = batch.then(rows => rows.get(k)!).finally(() => {
          // An old generation's cleanup must never remove a new request.
          if (this.pending.get(k) === pending) this.pending.delete(k)
        })
        this.pending.set(k, pending); answers.set(k, pending)
      }
    }
    const resolved = await Promise.all(unique.map(t => answers.get(key(t))!))
    if (generation !== this.epoch) throw Error('공개 정보를 다시 확인하고 있어요.')
    if (resolved.some(row => row.until <= this.now())) throw Error('공개 정보를 다시 불러와 주세요.')
    const values = new Map(unique.map((t, i) => [key(t), resolved[i].value]))
    return targets.map(t => values.get(key(t))!)
  }
}
