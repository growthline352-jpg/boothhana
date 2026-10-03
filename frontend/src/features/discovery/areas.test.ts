import { describe,it,expect } from 'vitest'
import { seoulAreas,parseAreas } from './areas'
import { parseBrowse,browseApiParams,isDiscoveryResults } from './browse'
import { calendarApiParams } from './calendar'
describe('서울 세부 지역',()=>{
 it('covers 25 districts without overlap',()=>{
  const districts=seoulAreas.flatMap(a=>[...a.districts]);expect(districts).toHaveLength(25);expect(new Set(districts).size).toBe(25)
 })
 it('normalizes multi-selection and drops unknown values',()=>expect(parseAreas('CENTRAL,NORTHWEST,CENTRAL,invalid')).toBe('NORTHWEST,CENTRAL'))
 it('retains identical server filters for lists and calendar',()=>{
  const state=parseBrowse(new URLSearchParams('region=SEOUL&areas=NORTHWEST,CENTRAL'))
  expect(browseApiParams(state,'2026-10-03').get('areas')).toBe('NORTHWEST,CENTRAL')
  expect(calendarApiParams(state,'2026-10').get('areas')).toBe('NORTHWEST,CENTRAL')
  expect(isDiscoveryResults('/discover',new URLSearchParams('region=SEOUL&areas=CENTRAL'))).toBe(true)
 })
 it('removes stale Seoul choices after changing province',()=>expect(parseBrowse(new URLSearchParams('region=GYEONGGI&areas=CENTRAL')).areas).toBe(''))
})
