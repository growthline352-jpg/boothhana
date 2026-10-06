import {describe,expect,it,vi} from 'vitest'
import {popupAddressQuery,resolvePopupLocations,storedPopupPins,type PopupPlace} from './popupLocations'
const point={lat:37.544,lng:127.055}
const place=(event_id:number,patch:Partial<PopupPlace>={}):PopupPlace=>({event_id,neighborhood:'SEONGSU',address:'서울특별시 성동구 연무장길 76',latitude:null,longitude:null,...patch})
describe('popup location supply',()=>{
 it('normalizes floor details while never geocoding district centers',()=>{
  expect(popupAddressQuery('서울특별시 성동구 서울숲길 38 2층')).toBe('서울특별시 성동구 서울숲길 38')
  expect(popupAddressQuery('서울 송파구 올림픽로 300 지하 1층')).toBe('서울 송파구 올림픽로 300')
  expect(popupAddressQuery('서울 마포구 연남동 123-4')).toBe('서울 마포구 연남동 123-4')
  for(const value of ['서울','서울 성동구','주소 미확인','경기 성남시 분당구 판교역로 10'])expect(popupAddressQuery(value)).toBe('')
 })
 it('reuses valid coordinates and resolves one address for every co-located popup',async()=>{
  const resolver=vi.fn().mockResolvedValue(point),progress=vi.fn()
  const result=await resolvePopupLocations([place(1),place(2),place(3,{latitude:37.55,longitude:127.02,address:'서울 성동구 서울숲길 10'}),place(4,{address:'서울'})],progress,()=>true,resolver)
  expect(resolver).toHaveBeenCalledExactlyOnceWith('서울특별시 성동구 연무장길 76')
  expect(result.map(p=>p.event_id)).toEqual([3,1,2]);expect(progress).toHaveBeenCalledTimes(1)
 })
 it('supplies grouped edition places while preserving their card identifier',async()=>{
  const resolver=vi.fn().mockResolvedValue(point)
  const result=await resolvePopupLocations([place(2,{display_event_id:1})],()=>{},()=>true,resolver)
  expect(result[0]).toMatchObject({event_id:2,display_event_id:1,latitude:point.lat,longitude:point.lng})
 })
 it('does not reuse stale coordinates from outside Seoul or turn failed lookup into a pin',async()=>{
  const resolver=vi.fn().mockResolvedValueOnce({lat:0,lng:0}).mockRejectedValueOnce(new Error('offline'))
  expect(storedPopupPins([place(1,{latitude:35.17,longitude:129.07}),place(2,{latitude:NaN,longitude:127}),place(3,{latitude:37.544,longitude:127.055})])).toHaveLength(1)
  expect(await resolvePopupLocations([place(1),place(2,{address:'서울 성동구 성수이로 20'})],()=>{},()=>true,resolver)).toEqual([])
 })
 it('limits simultaneous address lookups and completes the remaining queue',async()=>{
  let active=0,max=0
  const resolver=vi.fn(async()=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,5));active--;return point})
  const result=await resolvePopupLocations(Array.from({length:11},(_,i)=>place(i,{address:`서울 성동구 성수이로 ${i+1}`})),()=>{},()=>true,resolver)
  expect(result).toHaveLength(11);expect(max).toBeLessThanOrEqual(4);expect(resolver).toHaveBeenCalledTimes(11)
 })
 it('stops obsolete work and does not deliver coordinates into the next filter',async()=>{
  let current=true;const progress=vi.fn(),resolver=vi.fn(async()=>{current=false;return point})
  await resolvePopupLocations(Array.from({length:8},(_,i)=>place(i,{address:`서울 성동구 성수이로 ${i+1}`})),progress,()=>current,resolver)
  expect(progress).not.toHaveBeenCalled();expect(resolver.mock.calls.length).toBeLessThanOrEqual(4)
 })
})
