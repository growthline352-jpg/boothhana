import { guestEntry, matchesMemory, targetKey } from './memory'
import type { GuestMemory, MemoryPage, ResolvedMemory } from './types'

/** Pure local filtering: no network, no private note in the public request. */
export function guestPage(rows: GuestMemory[], resolved: ResolvedMemory[], query: URLSearchParams): MemoryPage {
  const byKey = new Map(resolved.map(r => [targetKey(r.target), r]))
  const all = rows.map(g => guestEntry(g, byKey.get(g.key) ?? { target: g.target, available: false, current: null, image: null }))
  const groups = new Map<number, { eventId: number; name: string; count: number }>()
  for (const e of all) {
    const old = groups.get(e.target.eventId)
    groups.set(e.target.eventId, { eventId: e.target.eventId, name: e.current?.memory.eventName || old?.name || '현재 공개되지 않는 행사', count: (old?.count || 0) + 1 })
  }
  const event = Number(query.get('eventId')) || 0, kind = query.get('type') || '', visited = query.get('visited') === 'true'
  const page = Math.max(0, Number(query.get('page')) || 0), size = 24, search = query.get('q') || ''
  const filtered = all.filter(e => (!event || e.target.eventId === event) && (!kind || e.target.type === kind) && (!visited || e.visitedDays.length > 0) && matchesMemory(e, search))
  return { items: filtered.slice(page * size, (page + 1) * size), page, size, total: filtered.length, groups: [...groups.values()] }
}
