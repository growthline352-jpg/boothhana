/** Filters alter result membership; editor/group changes must not reset pagination. */
const filters = new Set(['q', 'event', 'type', 'visited'])
export function libraryParams(current: URLSearchParams, patch: Record<string, string>): URLSearchParams {
  const next = new URLSearchParams(current)
  let filtering = false
  for (const [key, value] of Object.entries(patch)) {
    if (filters.has(key) && (current.get(key) || '') !== value) filtering = true
    if (value) next.set(key, value); else next.delete(key)
  }
  if (filtering && !('page' in patch)) next.delete('page')
  return next
}
export function lastMemoryPage(total: number, size = 24) { return Math.max(0, Math.ceil(total / size) - 1) }
