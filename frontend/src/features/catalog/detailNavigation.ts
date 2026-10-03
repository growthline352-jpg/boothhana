import type { EventData } from '../collection/api'
import type { PublicParticipant } from './api'
import { attendance, parseVisit, visitDays } from '../visit/visit'
import { seoulToday } from '../discovery/browse'

export type EventSection = 'home' | 'booths' | 'map' | 'reviews'

/** Keep saved map/info links working while giving each task its own section. */
export function eventSection(params: URLSearchParams): EventSection {
  const section = params.get('section')
  if (section === 'home' || section === 'booths' || section === 'map' || section === 'reviews') return section
  const view = params.get('view')
  return view === 'booths' || view === 'map' || view === 'reviews' ? view : 'home'
}

/** A direct booth link should open on an evidenced attendance day, when known. */
export function boothVisit(params: URLSearchParams, event: EventData, row: PublicParticipant, today = seoulToday()) {
  const visit = parseVisit(params, event)
  if (params.has('day')) return visit
  const confirmed = visitDays(event).filter(day => attendance(row, day, visit.hall) === 'confirmed')
  return { ...visit, day: confirmed.find(day => day >= today) || confirmed.at(-1) || visit.day }
}
