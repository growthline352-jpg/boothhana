import { isDiscoveryResults } from '../discovery/browse'

/** Local section tabs and calendar selections stay in the same scroll workspace. */
export function pageScrollKey(path: string, search: string): string {
  if (/^\/discover\/\d+\/?$/.test(path)) return path
  const params = new URLSearchParams(search)
  if ((path === '/' || path === '/discover') && !isDiscoveryResults(path, params)) {
    for (const key of ['openingRegion', 'closingRegion']) params.delete(key)
    params.sort()
    return params.size ? `${path}?${params}` : path
  }
  if (path === '/discover' && params.get('view') === 'calendar') {
    for (const key of ['day', 'calendarEvent', 'month']) params.delete(key)
    params.sort()
    return `${path}?${params}`
  }
  return path + search
}
