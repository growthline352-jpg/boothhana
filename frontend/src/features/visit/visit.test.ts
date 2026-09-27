import { describe, expect, it } from 'vitest'
import { catalogBoothPath, catalogEventPath } from './visit'

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
})
