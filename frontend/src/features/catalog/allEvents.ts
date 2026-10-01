import type { Page, PublicEventSummary } from './api'
import { combineDfestaSummaries } from './eventGroup'

/** Calendar data must be complete. Combine editions after pagination, never within each page. */
export async function loadAllEvents(query: URLSearchParams, read: (query: string) => Promise<Page<PublicEventSummary>>): Promise<PublicEventSummary[]> {
  const params = new URLSearchParams(query)
  params.set('size', '100')
  const rows: PublicEventSummary[] = []
  let total = 1
  for (let page = 0; page * 100 < total; page++) {
    params.set('page', String(page))
    const result = await read(params.toString())
    if (!Number.isSafeInteger(result.total) || result.total < 0 || result.total > 50000) throw new Error('행사 목록의 범위를 확인하지 못했습니다.')
    total = result.total
    if (!result.items.length && rows.length < total) throw new Error('일부 일정을 불러오지 못했습니다. 다시 확인해 주세요.')
    rows.push(...result.items)
    if (result.items.length < 100 && rows.length < total) throw new Error('일부 일정을 불러오지 못했습니다. 다시 확인해 주세요.')
  }
  return combineDfestaSummaries(rows)
}
