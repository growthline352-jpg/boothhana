import { publicCatalogApi, type PopularEventSummary, type PublicEventSummary } from '../catalog/api'
import { categories } from './categories'
import { calendarEventRanges } from './calendar'
import { combineOperatingSummaries, combineDfestaSummaries, DFESTA_SATURDAY_ID, DFESTA_SUNDAY_ID, isDfestaDay } from '../catalog/eventGroup'
/** The API groups editions and counts distinct members before applying its limit. */
export function rankedPopularEvents(rows: PopularEventSummary[], limit = 6): PopularEventSummary[] {
  return [...rows]
    .sort((a, b) => b.saveCount - a.saveCount
      || rows.indexOf(a) - rows.indexOf(b))
    .slice(0, limit)
}

export interface PopularEventsView { items: PopularEventSummary[] }

function nextDate(row: PublicEventSummary, today: string): string {
  return calendarEventRanges(row).filter(range => range.to >= today)
    .map(range => range.from < today ? today : range.from).sort()[0] || ''
}

/** Zero saves is a real count only after the global ranking confirms no saved current events. */
export function unsavedUpcomingEvents(rows: PublicEventSummary[], today: string): PopularEventSummary[] {
  // Exclude each source day before combining editions, preserving a remaining day's real ID.
  const eligible = rows.filter(row => !['CANCELED', 'POSTPONED', 'RESCHEDULED'].includes(row.event.operationStatus?.state || '') && nextDate(row, today))
  const paired = [DFESTA_SATURDAY_ID, DFESTA_SUNDAY_ID].every(id => eligible.some(row => row.id === id && isDfestaDay(row.id, row.event.name)))
  return (eligible.some(row=>row.operatingGroup)?combineOperatingSummaries(eligible):paired ? combineDfestaSummaries(eligible) : eligible)
    .sort((a, b) => nextDate(a, today).localeCompare(nextDate(b, today)) || a.id - b.id)
    .slice(0, 6).map(row => ({ ...row, saveCount: 0 }))
}

/** Shared member-save ranking; category filtering happens before the server limit. */
export async function loadPopularEvents(categoryCode: string | undefined, today: string): Promise<PopularEventsView> {
  const items = await publicCatalogApi.popular(categoryCode)
  if (items.length) return { items: rankedPopularEvents(items) }
  const selected = categories.filter(category => !categoryCode || category.code === categoryCode)
  const lists = await Promise.all(selected.map(category => publicCatalogApi.calendar(
    new URLSearchParams({ category: category.code, from: today, sort: 'DATE_ASC' }).toString(), false)))
  return { items: unsavedUpcomingEvents(lists.flat(), today) }
}
