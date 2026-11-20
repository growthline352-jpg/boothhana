import type { PopularEventSummary } from '../catalog/api'
import { combineDfestaSummaries, DFESTA_MAIN_ID, DFESTA_SUNDAY_ID, isDfestaEdition } from '../catalog/dfesta'

/** Rank actual member event saves; never substitute publication time for popularity. */
export function rankedPopularEvents(rows: PopularEventSummary[], limit = 6): PopularEventSummary[] {
  const main = rows.find(row => row.id === DFESTA_MAIN_ID && isDfestaEdition(row.id, row.event.name))
  const sunday = rows.find(row => row.id === DFESTA_SUNDAY_ID && isDfestaEdition(row.id, row.event.name))
  const grouped = main && sunday ? combineDfestaSummaries(rows) as PopularEventSummary[] : rows
  return grouped.map(row => main && sunday && row.id === DFESTA_MAIN_ID
    ? { ...row, saveCount: main.saveCount + sunday.saveCount }
    : row)
    .sort((a, b) => b.saveCount - a.saveCount
      || (b.publishedAt || '').localeCompare(a.publishedAt || '') || a.id - b.id)
    .slice(0, limit)
}
