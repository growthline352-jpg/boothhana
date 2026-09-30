import type { PopularEventSummary } from '../catalog/api'
import { combineDfestaSummaries, DFESTA_SATURDAY_ID, DFESTA_SUNDAY_ID, isDfestaDay } from '../catalog/eventGroup'

/** Only real member saves rank events. Duplicate-day editions share one card. */
export function rankedPopularEvents(rows: PopularEventSummary[], limit = 6): PopularEventSummary[] {
  const saturday = rows.find(row => row.id === DFESTA_SATURDAY_ID && isDfestaDay(row.id, row.event.name))
  const sunday = rows.find(row => row.id === DFESTA_SUNDAY_ID && isDfestaDay(row.id, row.event.name))
  // A single day keeps its real ID, so navigation never points at an absent publication.
  const grouped = saturday && sunday ? combineDfestaSummaries(rows) as PopularEventSummary[] : rows
  return grouped.map(row => saturday && sunday && row.id === DFESTA_SATURDAY_ID
    ? { ...row, saveCount: saturday.saveCount + sunday.saveCount }
    : row)
    .sort((a, b) => b.saveCount - a.saveCount
      || (b.publishedAt || '').localeCompare(a.publishedAt || '') || a.id - b.id)
    .slice(0, limit)
}
