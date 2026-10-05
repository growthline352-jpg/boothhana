import {describe,expect,it} from 'vitest'
import type {PublicEventSummary} from '../catalog/api'
import {itineraryRegions,regionForEvent} from './regionCatalog'
import {operatingEvents,regionCounts,regionEvents} from './regions'
import {recommendedEvents} from './model'

const day='2026-10-10'
const row=(id:number,change:Partial<PublicEventSummary['event']>={}):PublicEventSummary=>({id,participantCount:0,event:{name:`행사 ${id}`,subcategory:'BIRTHDAY_CAFE',organizer:null,edition:null,region:'SEOUL',venueName:'행사장',address:'서울특별시 노원구 동일로 123',description:'',admission:null,subjects:[],occurrences:[{startDate:day,endDate:day,startTime:null,endTime:null}],sources:[],banners:[],warnings:[],...change}})
const region=(name:string)=>itineraryRegions.find(r=>r.name===name)!.id

describe('district discovery for day plans',()=>{
 it('keeps every district label inside the map and near its geographic latitude',()=>{
  expect(itineraryRegions.filter(r=>r.province==='SEOUL')).toHaveLength(25)
  expect(itineraryRegions.filter(r=>r.province==='GYEONGGI')).toHaveLength(31)
  expect(new Set(itineraryRegions.map(r=>r.id)).size).toBe(56)
  for(const region of itineraryRegions){
   expect(region.label[0],region.name).toBeGreaterThan(0)
   expect(region.label[0],region.name).toBeLessThan(660)
   expect(region.label[1],region.name).toBeGreaterThanOrEqual(28)
   expect(region.label[1],region.name).toBeLessThanOrEqual(572)
   expect(Math.abs(region.label[1]-region.anchor[1]),region.name).toBeLessThanOrEqual(32)
  }
 })
 it('counts all four fields on the selected day and opens the exact same district list',()=>{
  const rows=[row(1),row(2,{subcategory:'BUSINESS'}),row(3,{subcategory:'MUSIC_FESTIVAL'}),row(4,{subcategory:'POPUP_RETAIL'}),row(5,{address:'서울특별시 강남구 영동대로 513'})]
  const id=region('노원구')
  expect(regionCounts(rows,day).counts[id]).toBe(4)
  expect(regionEvents(rows,day,id).map(r=>r.id)).toEqual([1,2,3,4])
  expect(regionCounts(rows,'2026-10-11').counts[id]).toBe(0)
 })
 it('uses actual operating venues and deduplicates across category responses',()=>{
  const first=row(2),other=row(3,{address:'경기도 고양시 일산서구 킨텍스로 217-60',region:'GYEONGGI'}),closed=row(4,{operationStatus:{state:'CANCELED',note:null,sourceUrl:null,checkedOn:null}})
  const parent={...row(1,{address:'서울특별시 중구 세종대로 110'}),operatingPlaces:[{eventId:2,event:first.event},{eventId:3,event:other.event},{eventId:4,event:closed.event}]}
  const rows=[parent,first,parent]
  expect(operatingEvents(rows,day).map(r=>r.id)).toEqual([2,3])
  expect(regionCounts(rows,day).counts[region('노원구')]).toBe(1)
  expect(regionCounts(rows,day).counts[region('고양시')]).toBe(1)
  expect(regionCounts(rows,day).counts[region('중구')]).toBe(0)
 })
 it('keeps missing and ambiguous addresses browseable without inventing district counts',()=>{
  const rows=[row(1,{name:'노원 축제',address:null,districts:[]}),row(2,{address:null,districts:['마포구','중구']})]
  expect(regionCounts(rows,day).unlocated).toBe(2)
  expect(regionEvents(rows,day,'UNLOCATED')).toHaveLength(2)
  expect(regionCounts(rows,day).counts[region('노원구')]).toBe(0)
 })
 it('uses one published district as a fallback, but gives the actual address priority',()=>{
  expect(regionForEvent(row(1,{address:null,districts:['노원구']}).event)?.name).toBe('노원구')
  expect(regionForEvent(row(1,{address:'서울특별시 마포구 양화로 188',districts:['노원구']}).event)?.name).toBe('마포구')
 })
 it('does not mix same-named districts or Gwangju across provinces',()=>{
  expect(regionForEvent(row(1,{address:'부산광역시 중구 중앙대로 1'}).event)).toBeUndefined()
  expect(regionForEvent(row(1,{address:'광주광역시 동구 금남로',region:'GYEONGGI'}).event)).toBeUndefined()
  expect(regionForEvent(row(1,{address:'경기도 광주시 경안로 1',region:'GYEONGGI'}).event)?.name).toBe('광주시')
  expect(regionForEvent(row(1,{address:'경기 고양 일산서구 킨텍스로 217',region:'GYEONGGI'}).event)?.name).toBe('고양시')
 })
 it('uses district identity for follow-up recommendations rather than a district word in a venue name',()=>{
  const wrong=row(2,{address:'서울특별시 강남구 테헤란로 1',venueName:'노원 굿즈 카페'})
  expect(recommendedEvents([row(1),wrong],day,region('노원구'),undefined,'DATE').map(r=>r.row.id)).toEqual([1])
 })
})
