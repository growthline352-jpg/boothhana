import { afterEach, expect, it, vi } from 'vitest'
import { publicPage, referralOrigin } from './measurement'
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })
it('only measures exact production hosts and public route shapes', () => {
  for (const href of ['https://boothana.kr/admin/events','https://boothana.kr/library','https://boothana.kr/support/new?token=secret','https://boothana.kr/reservations','https://evil.test/','http://boothana.kr/','https://boothana.kr.evil.test/','https://boothhana.vercel.app/']) expect(publicPage(href)).toBeNull()
  for (const host of ['boothana.kr','subculture.boothana.kr','expo.boothana.kr','festival.boothana.kr']) expect(publicPage(`https://${host}/`)).not.toBeNull()
})
it('drops search terms, fragments and user-controlled titles', () => {
  expect(publicPage('https://boothana.kr/itinerary/shared/abcdefghijklmnopqrstuv')).toBeNull()
  expect(publicPage('https://expo.boothana.kr/discover?q=private-email&token=secret#private')).toEqual({page_location:'https://expo.boothana.kr/discover',page_title:'행사 검색',site_section:'expo'})
  expect(publicPage('https://subculture.boothana.kr/discover/1/booths/43?day=2026-10-03')?.page_title).toBe('부스 상세')
})
it('keeps only recognized referral providers and strips personal paths and queries', () => {
  expect(referralOrigin('https://www.google.co.kr/search?q=private-email#token')).toBe('https://www.google.com/')
  expect(referralOrigin('https://m.search.naver.com/search.naver?query=private')).toBe('https://www.naver.com/')
  expect(referralOrigin('https://expo.boothana.kr/discover/9?q=private')).toBe('https://expo.boothana.kr/')
  for(const url of ['https://google.com.evil.test/','https://www.google.com@evil.test/','https://docs.google.com/private-document','https://search.google.com/search-console','https://private-company.example/secret','javascript:alert(1)',''])expect(referralOrigin(url)).toBe('')
})
it('sends sanitized attribution and closed action fields only after consent', async () => {
  const win: Record<string, any> = {location:{href:'https://expo.boothana.kr/discover/20?q=private'}}
  vi.stubGlobal('window',win)
  vi.stubGlobal('document',{referrer:'https://www.google.com/search?q=secret',createElement:()=>({}),head:{appendChild:vi.fn()}})
  const {setMeasurement,emitPublicAction}=await import('./measurement')
  const events=()=>win.dataLayer?.map((args:IArguments)=>Array.from(args)).filter((args:unknown[])=>args[0]==='event')??[]
  emitPublicAction('floorplan_open');expect(events()).toHaveLength(0)
  setMeasurement('granted',win.location.href)
  emitPublicAction('floorplan_open',{eventId:20,participantId:80,itemType:'EVENT',searchTerm:'secret'} as any)
  expect(events()[0][2].page_referrer).toBe('https://www.google.com/')
  expect(events()[1]).toMatchObject(['event','floorplan_open',{event_id:20,participant_id:80,page_location:'https://expo.boothana.kr/discover/20'}])
  expect(JSON.stringify(win.dataLayer)).not.toMatch(/secret|private|searchTerm/)
  setMeasurement('denied',win.location.href);emitPublicAction('save_item');expect(events()).toHaveLength(2)
  setMeasurement('granted','https://expo.boothana.kr/library');emitPublicAction('save_item');expect(events()).toHaveLength(2)
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
