import type { EventData, Occurrence } from '../collection/api'
import type { PublicParticipant, Location } from '../catalog/api'
import { seoulToday } from '../discovery/browse'

export function validDay(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T12:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}
export function includesDay(o: Occurrence, day: string) { return o.startDate <= day && o.endDate >= day }
export function visitDays(event: EventData): string[] {
  const days = new Set<string>()
  for (const o of event.occurrences) {
    if (!validDay(o.startDate) || !validDay(o.endDate)) continue
    const date = new Date(`${o.startDate}T12:00:00Z`)
    // Existing contract caps each span at 366 days. A global bound also protects old data.
    for (let n = 0; n <= 366 && days.size < 2000; n++) {
      const day = date.toISOString().slice(0, 10)
      if (day > o.endDate) break
      days.add(day); date.setUTCDate(date.getUTCDate() + 1)
    }
  }
  return [...days].sort()
}
export function defaultDay(event: EventData, requested?: string | null, today = seoulToday()) {
  const days = visitDays(event)
  if (requested && days.includes(requested)) return requested
  return days.find(d => d >= today) || days.at(-1) || ''
}
export function normalizePlace(value: string | null | undefined) {
  return (value || '').normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ')
}
export function relevantLocations(locations: Location[], day: string, hall = '') {
  return locations.filter(l => (!day || !confirmedLocationDates(l) || !l.startDate || !l.endDate || (l.startDate <= day && l.endDate >= day))
    && (!hall || !l.hall || normalizePlace(l.hall) === normalizePlace(hall)))
}
export function attendance(row: PublicParticipant, day: string, hall = ''): 'confirmed' | 'unknown' | 'other' {
  const locations = relevantLocations(row.participant.locations, day, hall)
  if (locations.some(l => (!day || confirmedLocationDates(l)) && (!hall || l.hall))) return 'confirmed'
  if (locations.length || !row.participant.locations.length) return 'unknown'
  return 'other'
}
/** An event's duration is not proof that a particular booth attends every day. */
export function confirmedLocationDates(location: Location) {
  if (!location.startDate || !location.endDate) return false
  if (location.dateEvidence) return ['DECLARED','ROSTER'].includes(location.dateEvidence)
  return ['ASSIGNED','NOT_APPLICABLE'].includes(location.status)
}
export type VisitTab = 'booths' | 'map' | 'info'
export interface VisitQuery {day: string; hall: string; q: string; tab: VisitTab; booth: number | null; focus: number | null; product?: number | null}
export interface VisitContext {day?: string; hall?: string}
const positiveId = (v: string | null) => v && /^\d+$/.test(v) && Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : null
export function parseVisit(params: URLSearchParams, event: EventData): VisitQuery {
  const tab = params.get('view')
  return { day: defaultDay(event, params.get('day')), hall: (params.get('hall') || '').trim().slice(0, 150),
    q: (params.get('q') || '').slice(0, 100), tab: tab === 'map' || tab === 'info' ? tab : 'booths',
    booth: positiveId(params.get('booth')), focus: positiveId(params.get('focus')),product:positiveId(params.get('product')) }
}
/** Allowlisted public context only. Never propagate arbitrary query strings or administrator notes. */
export function visitParams(query: VisitQuery): URLSearchParams {
  const p = new URLSearchParams()
  if (validDay(query.day)) p.set('day', query.day)
  if (query.hall) p.set('hall', query.hall.slice(0,150))
  if (query.q) p.set('q', query.q.slice(0,100))
  if (query.tab !== 'booths') p.set('view', query.tab)
  if (query.booth) p.set('booth', String(query.booth))
  if (query.focus) p.set('focus', String(query.focus))
  if(query.product)p.set('product',String(query.product))
  return p
}
function pathWithContext(path: string, context: VisitContext, view: VisitTab = 'booths', focus?: number | null) {
  const params = new URLSearchParams()
  if (validDay(context.day)) params.set('day', context.day)
  if (context.hall) params.set('hall', context.hall.trim().slice(0, 150))
  if (view !== 'booths') params.set('view', view)
  if (focus && Number.isSafeInteger(focus) && focus > 0) params.set('focus', String(focus))
  const query = params.toString()
  return query ? `${path}?${query}` : path
}
export function catalogEventPath(eventId: string | number, context: VisitContext, view: VisitTab = 'booths', focus?: number | null) {
  return pathWithContext(`/discover/${eventId}`, context, view, focus)
}
export function catalogBoothPath(eventId: string | number, participantId: string | number, context: VisitContext) {
  return pathWithContext(`/discover/${eventId}/booths/${participantId}`, context)
}
export function publicLink(value: string | null | undefined): string | null {
  try { if (!value) return null; const u = new URL(value)
    return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : null
  } catch { return null }
}
export function sourceLabel(kind: string, url: string) {
  const names: Record<string,string> = {OFFICIAL:'공식 행사 안내',ORGANIZER_SOCIAL:'주최자 공지',VENUE:'개최 장소 안내',AGGREGATOR:'행사 정보 출처',OTHER:'참고 안내'}
  let host = ''; try { host = new URL(url).hostname.replace(/^www\./,'') } catch { /* omitted */ }
  return `${names[kind] || '참고 안내'}${host ? ` · ${host}` : ''}`
}
export function usableAddress(value: string | null | undefined) {
  // Only use an explicitly published street address; never guess a private venue from its name.
  const address = (value || '').trim()
  return /^(?:서울(?:특별시)?|경기(?:도)?)(?:\s|$)/.test(address) && !/비공개|미정|모처|미확인/.test(address)
    && /(?:로|길)\s*\d|\d+(?:-\d+)?(?:번지)?/.test(address)
}

/** Clear all membership filters while preserving the selected public visit day/view. */
export function resetVisitFilters(params: URLSearchParams, event: EventData): URLSearchParams {
  const state = parseVisit(params, event)
  return visitParams({ ...state, q: '', hall: '', booth: null, focus: null, product: null })
}
