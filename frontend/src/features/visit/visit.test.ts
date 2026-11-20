import { describe, expect, it } from 'vitest'
import { catalogBoothPath, catalogEventPath, parseVisit, visitParams } from './visit'
import type { EventData } from '../collection/api'

describe('catalog route depth', () => {
  it('builds a dedicated booth detail route below its event', () => {
    expect(catalogBoothPath(1, 26, { day: '2026-10-03', hall: 'A홀' }))
      .toBe('/discover/1/booths/26?day=2026-10-03&hall=A%ED%99%80')
  })

  it('returns from booth detail to the event or its focused floor plan', () => {
    expect(catalogEventPath(1, { day: '2026-10-03' }))
      .toBe('/discover/1?day=2026-10-03')
    expect(catalogEventPath(1, { day: '2026-10-03' }, 'map', 26))
      .toBe('/discover/1?day=2026-10-03&view=map&focus=26')
  })

  it('opens Home by default while preserving map and review deep links', () => {
    const event = {occurrences:[{startDate:'2026-10-03',endDate:'2026-10-04'}]} as EventData
    expect(parseVisit(new URLSearchParams('day=2026-10-03'),event).tab).toBe('home')
    expect(parseVisit(new URLSearchParams('day=2026-10-03&view=map&focus=26'),event).tab).toBe('map')
    expect(visitParams(parseVisit(new URLSearchParams('day=2026-10-04&view=reviews'),event)).get('view')).toBe('reviews')
  })
})
