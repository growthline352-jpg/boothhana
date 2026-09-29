import { afterEach, expect, it, vi } from 'vitest'
import { publicPage } from './measurement'
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })
it('only measures exact production hosts and public route shapes', () => {
  for (const href of ['https://boothana.kr/admin/events','https://boothana.kr/library','https://boothana.kr/support/new?token=secret','https://boothana.kr/reservations','https://evil.test/','http://boothana.kr/','https://boothana.kr.evil.test/','https://boothhana.vercel.app/']) expect(publicPage(href)).toBeNull()
  for (const host of ['boothana.kr','subculture.boothana.kr','expo.boothana.kr','festival.boothana.kr']) expect(publicPage(`https://${host}/`)).not.toBeNull()
})
it('drops search terms, fragments and user-controlled titles', () => {
  expect(publicPage('https://expo.boothana.kr/discover?q=private-email&token=secret#private')).toEqual({page_location:'https://expo.boothana.kr/discover',page_title:'행사 검색',site_section:'expo'})
  expect(publicPage('https://subculture.boothana.kr/discover/1/booths/43?day=2026-10-03')?.page_title).toBe('부스 상세')
})
it('waits for opt-in, loads once, deduplicates renders, tracks SPA pages and disables private routes', async () => {
  const win: Record<string, any> = {}
  const appendChild = vi.fn()
  vi.stubGlobal('window',win)
  vi.stubGlobal('document',{createElement:()=>({}),head:{appendChild}})
  const {setMeasurement,pauseMeasurement,MEASUREMENT_ID}=await import('./measurement')
  const page='https://boothana.kr/'
  setMeasurement(null,page);setMeasurement('denied',page)
  expect(appendChild).not.toHaveBeenCalled()
  setMeasurement('granted',page);pauseMeasurement();setMeasurement('granted',page)
  const events=()=>win.dataLayer.map((a: IArguments)=>Array.from(a)).filter((a: unknown[])=>a[0]==='event')
  expect(appendChild).toHaveBeenCalledTimes(1);expect(events()).toHaveLength(1)
  setMeasurement('granted','https://boothana.kr/discover?q=private')
  expect(events()).toHaveLength(2);expect(JSON.stringify(win.dataLayer)).not.toContain('private')
  setMeasurement('granted','https://boothana.kr/library')
  expect(win[`ga-disable-${MEASUREMENT_ID}`]).toBe(true);expect(events()).toHaveLength(2)
  setMeasurement('granted',page);expect(events()).toHaveLength(3)
  setMeasurement('denied',page);expect(win[`ga-disable-${MEASUREMENT_ID}`]).toBe(true)
})
