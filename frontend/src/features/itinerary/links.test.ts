import {afterEach,describe,expect,it,vi} from 'vitest'
import {itineraryHref} from './links'

afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs()})
describe('one browser storage origin for itineraries',()=>{
 it.each(['subculture.boothana.kr','popup.boothana.kr','expo.boothana.kr','festival.boothana.kr','boothana.kr'])('opens the same schedule origin from %s with its event and day',host=>{
  vi.stubGlobal('window',{location:{host}});vi.stubEnv('VITE_CATEGORY_SITES_ENABLED','true')
  expect(itineraryHref()).toBe('https://boothana.kr/itinerary')
  expect(itineraryHref(173,'2026-10-09')).toBe('https://boothana.kr/itinerary?event=173&day=2026-10-09')
 })
 it('keeps local review links local even when production split sites are enabled',()=>{
  vi.stubGlobal('window',{location:{host:'127.0.0.1:4186'}});vi.stubEnv('VITE_CATEGORY_SITES_ENABLED','true');vi.stubEnv('VITE_PUBLIC_SITE_URL','https://boothana.kr')
  expect(itineraryHref(173,'2026-10-09')).toBe('/itinerary?event=173&day=2026-10-09')
 })
})
