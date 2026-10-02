import { publicCatalogApi, type PopularEventSummary, type PublicEventSummary } from '../catalog/api'
import { interestApi } from '../interests/api'
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

export interface PopularEventsView { items: PopularEventSummary[]; personalized: boolean }

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

export async function loadPopularEvents(categoryCode: string | undefined, userId: number | null, today: string): Promise<PopularEventsView> {
  if (userId !== null) {
    const interests = await interestApi.get()
    if (interests.userId !== userId) throw new Error('관심분야를 다시 확인해 주세요.')
    // Selecting just the category means interest in its whole field, even without child options.
    const selected = categories.filter(category => (!categoryCode || category.code === categoryCode) && category.code in interests.fields)
    if (selected.length) {
      const results = await Promise.all(selected.map(category => interestApi.featured(category.code, '', true)))
      // Each category returns its top five after filtering; their union contains the overall top five.
      const items = results.flatMap(result => result.items).sort((a, b) => b.saveCount - a.saveCount
        || nextDate(a, today).localeCompare(nextDate(b, today)) || a.id - b.id).slice(0, 5)
      return { items, personalized: true }
    }
  }
  // An unset interest field also falls back across all three categories on category home pages.
  const items = await publicCatalogApi.popular()
  if (items.length) return { items: rankedPopularEvents(items), personalized: false }
  const lists = await Promise.all(categories.map(category => publicCatalogApi.calendar(
    new URLSearchParams({ category: category.code, from: today, sort: 'DATE_ASC' }).toString(), false)))
  return { items: unsavedUpcomingEvents(lists.flat(), today), personalized: false }
}
