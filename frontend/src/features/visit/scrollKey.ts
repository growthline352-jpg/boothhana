/** Selection and month changes stay in the same calendar workspace scroll position. */
export function pageScrollKey(path: string, search: string): string {
  if (/^\/discover\/\d+\/?$/.test(path)) return path
  const params = new URLSearchParams(search)
  if (path === '/discover' && params.get('view') === 'calendar') {
    for (const key of ['day', 'calendarEvent', 'month']) params.delete(key)
    params.sort()
    return `${path}?${params}`
  }
  return path + search
}
