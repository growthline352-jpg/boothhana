import type { Page, PublicEventSummary } from '../catalog/api'
import { searchResultsHref } from './browse'

type HomePage = Page<PublicEventSummary>
type Entry = { request: Promise<HomePage>; data?: HomePage }

/** Public feeds only; owned by one mounted discovery page and reset on category/day changes. */
export class HomeFeed {
  private entries = new Map<string, Entry>()
  private fetch: (query: string) => Promise<HomePage>
  constructor(fetch: (query: string) => Promise<HomePage>) { this.fetch = fetch }

  peek(query: string) { return this.entries.get(query)?.data }

  load(query: string): Promise<HomePage> {
    const existing = this.entries.get(query)
    if (existing) return existing.request
    const entry: Entry = { request: Promise.resolve().then(() => this.fetch(query)).then(data => {
      entry.data = data
      return data
    }).catch(error => {
      if (this.entries.get(query) === entry) this.entries.delete(query)
      throw error
    }) }
    this.entries.set(query, entry)
    return entry.request
  }
}

export type HomeRegionKey = 'openingRegion' | 'closingRegion'
export function homeSectionRegion(params: URLSearchParams, key: HomeRegionKey): string {
  const region = params.get(key) || ''
  return ['SEOUL', 'GYEONGGI'].includes(region) ? region : ''
}

export function homeSectionHref(params: URLSearchParams, category: string, region: string): string {
  const next = new URLSearchParams(params)
  next.delete('openingRegion'); next.delete('closingRegion'); next.delete('areas')
  if (region) next.set('region', region)
  else next.delete('region')
  return searchResultsHref(next, category, '')
}
