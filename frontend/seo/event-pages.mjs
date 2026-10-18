export const EVENT_SECTIONS = { home: '행사 안내', booths: '참가 부스·굿즈', map: '배치도', reviews: '이번·지난 회차 후기' }

export function parseEventPage(path) {
  const match = /^\/discover\/([1-9]\d*)(?:\/(booths|map|reviews)(?:\/([1-9]\d*))?)?\/?$/.exec(path)
  if (!match || (match[3] && match[2] !== 'booths') || !Number.isSafeInteger(Number(match[1])) || (match[3] && !Number.isSafeInteger(Number(match[3])))) return null
  return { eventId: match[1], section: match[3] ? 'booth' : match[2] || 'home', participantId: match[3] || null }
}

export function eventSectionHref(id, section = 'home', search = '') {
  const query = new URLSearchParams(search)
  for (const key of ['section', 'view', 'booth']) query.delete(key)
  if (section !== 'map') query.delete('focus')
  return `/discover/${id}${section === 'home' ? '' : `/${section}`}${query.size ? `?${query}` : ''}`
}

/** Only old navigation syntax is rewritten; original booth IDs and visit context survive. */
export function legacyEventRedirect(path, search = '') {
  const page = parseEventPage(path)
  if (!page || page.section === 'booth') return null
  const query = new URLSearchParams(search)
  const booth = query.get('booth')
  if (page.section === 'home' && /^[1-9]\d*$/.test(booth || '')) {
    for (const key of ['booth', 'section', 'view']) query.delete(key)
    return `/discover/${page.eventId}/booths/${booth}${query.size ? `?${query}` : ''}`
  }
  const legacy = query.get('section') || query.get('view')
  const section = page.section === 'home' && Object.hasOwn(EVENT_SECTIONS, legacy) ? legacy
    : page.section === 'home' && legacy === 'info' ? 'home' : page.section
  const sunday = page.eventId === '7'
  if (sunday && !query.has('day')) query.set('day', '2026-10-04')
  if (!sunday && !query.has('section') && !query.has('view')) return null
  const destination = eventSectionHref(sunday ? '1' : page.eventId, section, query)
  return destination !== path + (search ? `?${String(search).replace(/^\?/, '')}` : '') ? destination : null
}
