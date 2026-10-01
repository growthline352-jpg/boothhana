import { describe, expect, it } from 'vitest'
import { pageScrollKey } from './scrollKey'

describe('calendar workspace scroll position', () => {
  const key = (query: string) => pageScrollKey('/discover', `?view=calendar&category=subculture${query}`)
  it('preserves scroll during date, event, list-back, close and month selections', () => {
    expect(key('&month=2026-10&day=2026-10-04&calendarEvent=1')).toBe(key('&month=2026-11'))
    expect(key('&day=2026-10-05')).toBe(key(''))
  })
  it('keeps filter/category workspaces and list mode separate', () => {
    expect(key('&type=DOLL')).not.toBe(key('&type=ONLY_EVENT'))
    expect(key('&region=SEOUL')).not.toBe(key('&region=GYEONGGI'))
    expect(key('&q=카페')).not.toBe(key('&q=인형'))
    expect(key('')).not.toBe(pageScrollKey('/discover', '?view=calendar&category=festivals'))
    expect(key('')).not.toBe(pageScrollKey('/discover', '?view=results&category=subculture'))
  })
  it('normalizes only calendar key order, leaving existing detail and list behavior intact', () => {
    expect(key('&type=DOLL&region=SEOUL')).toBe(pageScrollKey('/discover', '?region=SEOUL&type=DOLL&category=subculture&view=calendar'))
    expect(pageScrollKey('/discover/1', '?day=2026-10-03')).toBe('/discover/1')
    expect(pageScrollKey('/discover', '?view=results&page=2')).toBe('/discover?view=results&page=2')
  })
})
