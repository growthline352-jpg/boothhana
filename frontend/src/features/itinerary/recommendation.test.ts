import {describe,expect,it,vi} from 'vitest'
import {eventArea,manualPlaceStop,planNearbyCenter,resolveEventLocation} from './recommendation'
import {readPlans,savedPlanSignature,writePlan,type Plan,type PlanStop} from './model'
import type {Place} from './places'

const seongsu={lat:37.5445,lng:127.0557},suwon={lat:37.2571,lng:127.0439}
const stop=(change:Partial<PlanStop>={}):PlanStop=>({id:'main',kind:'EVENT',name:'수원 행사',address:'경기 수원시 영통구 광교중앙로 140',point:null,start:'10:00',duration:180,locked:true,note:'',url:'/discover/1',source:'CATALOG',...change})
const plan=(change:Partial<Plan>={}):Plan=>({version:1,id:'plan-1',title:'수원 행사 방문',purpose:'EVENT',day:'2026-10-09',start:'10:00',end:'19:00',area:'',style:'VIEW',stops:[stop()],updatedAt:'2026-10-04T00:00:00Z',...change})

describe('itinerary location and saved draft recovery',()=>{
 it('restores an edited draft against the persisted version rather than marking the draft saved',()=>{
  const values=new Map<string,string>(),storage={getItem:(key:string)=>values.get(key)||null,setItem:(key:string,value:string)=>{values.set(key,value)}}
  const original=plan(),edited=plan({title:'시간을 바꾼 일정',stops:[stop({start:'11:00'})]})
  writePlan(storage,'saved',original);writePlan(storage,'draft',edited)
  const restored=readPlans(storage,'draft')[0],signature=savedPlanSignature(readPlans(storage,'saved'),restored.id)
  expect(signature).toBe(JSON.stringify(original))
  expect(JSON.stringify(restored)).not.toBe(signature)
  writePlan(storage,'saved',restored)
  expect(savedPlanSignature(readPlans(storage,'saved'),restored.id)).toBe(JSON.stringify(restored))
  expect(savedPlanSignature(readPlans(storage,'saved'),'new-plan')).toBe('')
 })
 it('recognizes new districts without reusing the previously selected neighborhood',()=>{
  expect(eventArea('경기 수원시 영통구 광교중앙로 140','수원컨벤션센터')).toBe('GYEONGGI_31010')
  expect(eventArea('경기 안양시 동안구 평촌대로 76')).toBe('GYEONGGI_31040')
  expect(eventArea('서울 성동구 연무장길 76')).toBe('SEOUL_11040')
  expect(eventArea('대전 유성구 엑스포로 1')).toBe('')
  expect(eventArea('부산광역시 중구 중앙대로 1')).toBe('')
 })
 it('resolves the actual event address and uses that point for nearby search outside preset neighborhoods',async()=>{
  const resolve=vi.fn().mockResolvedValue(suwon)
  const point=await resolveEventLocation(stop().address,null,resolve)
  expect(resolve).toHaveBeenCalledExactlyOnceWith(stop().address)
  expect(planNearbyCenter(plan({stops:[stop({point})]}),seongsu)).toEqual(suwon)
 })
 it('blocks event nearby searches when venue resolution fails instead of using an unrelated area or cafe',async()=>{
  const resolve=vi.fn().mockRejectedValue(new Error('provider unavailable'))
  const point=await resolveEventLocation(stop().address,null,resolve)
  expect(point).toBeNull()
  const unresolved=plan({stops:[stop({point}),stop({id:'cafe',kind:'CAFE',point:seongsu})]})
  expect(planNearbyCenter(unresolved,seongsu)).toBeNull()
 })
 it('does not geocode missing addresses and ignores invalid provider coordinates',async()=>{
  const resolve=vi.fn().mockResolvedValue({lat:0,lng:0})
  expect(await resolveEventLocation('',null,resolve)).toBeNull()
  expect(resolve).not.toHaveBeenCalled()
  expect(await resolveEventLocation(stop().address,null,resolve)).toBeNull()
 })
 it('preserves a verified event point and does not let a pinned meal override the main venue',async()=>{
  const resolve=vi.fn()
  expect(await resolveEventLocation(stop().address,suwon,resolve)).toEqual(suwon)
  expect(resolve).not.toHaveBeenCalled()
  expect(planNearbyCenter(plan({stops:[stop({id:'meal',kind:'FOOD',point:seongsu}),stop({point:suwon})]}),seongsu)).toEqual(suwon)
 })
 it('continues using the chosen neighborhood when a date has no event location',()=>{
  expect(planNearbyCenter(plan({purpose:'DATE',stops:[]}),seongsu)).toEqual(seongsu)
 })
 it('keeps a date centered on the chosen event and blocks an unrelated area fallback when its position is unknown',()=>{
  expect(planNearbyCenter(plan({purpose:'DATE',stops:[stop({point:null})]}),seongsu)).toBeNull()
  expect(planNearbyCenter(plan({purpose:'DATE',stops:[stop({point:suwon}),stop({id:'meal',kind:'FOOD',locked:true,point:seongsu})]}),seongsu)).toEqual(suwon)
 })
 it('preserves a selected Kakao place source and original link through save and recovery',()=>{
  const selected:Place={id:'KAKAO/123',name:'수원 카페',address:stop().address,point:suwon,kind:'CAFE',url:'https://place.map.kakao.com/123',provider:'KAKAO'}
  const chosen=manualPlaceStop(stop({kind:'CAFE',name:selected.name,address:selected.address,point:selected.point,source:'MANUAL',url:''}),selected)
  let value='';const storage={getItem:()=>value,setItem:(_key:string,next:string)=>{value=next}}
  writePlan(storage,'schedule',plan({stops:[chosen]}))
  expect(readPlans(storage,'schedule')[0].stops[0]).toMatchObject({source:'KAKAO',url:selected.url})
 })
 it('does not attach a provider link to renamed, re-addressed, moved or explicitly manual places',()=>{
  const selected:Place={id:'KAKAO/123',name:'수원 카페',address:stop().address,point:suwon,kind:'CAFE',url:'https://place.map.kakao.com/123',provider:'KAKAO'}
  const original=stop({kind:'CAFE',name:selected.name,address:selected.address,point:selected.point})
  for(const change of [{name:'내가 입력한 카페'},{address:'서울 성동구 연무장길 76'},{point:seongsu}]){
   expect(manualPlaceStop({...original,...change},selected)).toMatchObject({source:'MANUAL',url:''})
  }
  expect(manualPlaceStop(original,null)).toMatchObject({source:'MANUAL',url:''})
 })
})
