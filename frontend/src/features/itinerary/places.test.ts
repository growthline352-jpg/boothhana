import {describe,it,expect} from 'vitest'
import {decodePlaces,placeStop} from './places'
import {savedPlanSignature,validatePlan,type Plan} from './model'

describe('operating place and saved draft boundaries',()=>{
 it('preserves Kakao identity, address and map attribution through a saved stop',()=>{
  const [place]=decodePlaces({features:[{geometry:{coordinates:[127.0557,37.5445]},properties:{provider:'KAKAO',place_id:'123',name:'서울숲 카페',address:'서울 성동구 서울숲길 1',place_url:'https://place.map.kakao.com/123',osm_value:'cafe'}}]})
  expect(place.id).toBe('KAKAO/123');expect(place.kind).toBe('CAFE');expect(place.address).toBe('서울 성동구 서울숲길 1')
  const stop=placeStop(place,'15:00')
  const plan:Plan={version:1,id:'plan',title:'성수',purpose:'DATE',day:'2026-10-09',start:'13:00',end:'19:00',area:'SEONGSU',style:'CONTENT',stops:[stop],updatedAt:new Date().toISOString()}
  expect(stop.source).toBe('KAKAO');expect(stop.url).toBe('https://place.map.kakao.com/123');expect(validatePlan(plan)).toBe(true)
  const draft={...plan,title:'수정 중인 일정'}
  expect(savedPlanSignature([plan],draft.id)).toBe(JSON.stringify(plan));expect(savedPlanSignature([plan],draft.id)).not.toBe(JSON.stringify(draft))
 })
 it('does not turn foreign or broken geometry into a location',()=>{
  expect(decodePlaces({features:[{geometry:{coordinates:[0,0]},properties:{name:'잘못된 위치'}}]})).toEqual([])
 })
})
