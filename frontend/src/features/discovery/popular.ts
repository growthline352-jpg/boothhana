import type { PopularEventSummary } from '../catalog/api'
/** The API groups editions and counts distinct members before applying its limit. */
export function rankedPopularEvents(rows: PopularEventSummary[], limit = 6): PopularEventSummary[] {
  return [...rows]
    .sort((a, b) => b.saveCount - a.saveCount
      || (b.publishedAt || '').localeCompare(a.publishedAt || '') || a.id - b.id)
    .slice(0, limit)
}
