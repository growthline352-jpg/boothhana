import {describe,it,expect} from 'vitest'
import type {PublicEventSummary} from '../catalog/api'
import {emptyTopics,matchesTopics,subjectOptions,upcomingMatches} from './topics'
import {recommendedEvents} from './model'
const row=(id:number,subjects:string[],subcategory:PublicEventSummary['event']['subcategory']='BIRTHDAY_CAFE'):PublicEventSummary=>({id,participantCount:0,event:{name:`행사 ${id}`,subcategory,subjects,address:'서울 마포구 서교동',venueName:'카페',description:'원신 은혼 애니메이션을 좋아하는 분',region:'SEOUL',organizer:null,edition:null,admission:null,sources:[],banners:[],warnings:[],occurrences:[{startDate:'2026-10-08',endDate:'2026-10-11',startTime:null,endTime:null}]}})
describe('subculture itinerary topic selection',()=>{
 it('combines broad OR choices with exact work/character OR choices',()=>{
  const gintoki=row(1,['애니메이션','은혼','사카타 긴토키'])
  expect(matchesTopics(gintoki,{topics:['GAME','ANIME_MANGA'],subjects:['은혼','사카타 긴토키']})).toBe(true)
  expect(matchesTopics(gintoki,{topics:['GAME'],subjects:['은혼']})).toBe(false)
  expect(matchesTopics(gintoki,{topics:['ANIME_MANGA'],subjects:['긴토키']})).toBe(false)
  expect(matchesTopics(row(2,['NOVEL','현무1팀']),{topics:['ANIME_MANGA'],subjects:[]})).toBe(false)
 })
 it('never matches popup fields or an unconfirmed description when topics are selected',()=>{
  expect(matchesTopics(row(1,['애니메이션','은혼'],'POPUP_RETAIL'),{topics:['ANIME_MANGA'],subjects:[]})).toBe(false)
  expect(matchesTopics(row(2,[]),{topics:['ANIME_MANGA'],subjects:[]})).toBe(false)
  expect(matchesTopics(row(2,[]),emptyTopics())).toBe(true)
 })
 it('suggests only actual non-generic tags within the selected topic',()=>{
  const choices=subjectOptions([row(1,['애니메이션','은혼','사카타 긴토키']),row(2,['GAME','원신']),row(3,['애니메이션','은혼'],'POPUP_RETAIL')],{topics:['ANIME_MANGA'],subjects:[]})
  expect(choices.map(c=>c.value)).toEqual(['사카타 긴토키','은혼'])
  expect(choices.find(c=>c.value==='은혼')?.count).toBe(1)
 })
 it('offers the next real date instead of filling the list with unrelated events',()=>{
  const selected={topics:[],subjects:['은혼']},cancel=row(2,['은혼']);cancel.event.operationStatus={state:'CANCELED',note:null,sourceUrl:null,checkedOn:null}
  expect(upcomingMatches([row(1,['은혼']),cancel,row(3,['원신'])],selected,'2026-10-05').map(x=>[x.row.id,x.day])).toEqual([[1,'2026-10-08']])
  expect(upcomingMatches([row(1,['은혼'])],selected,'2026-10-12')).toEqual([])
 })
 it('keeps topic constraints when adding nearby events to a completed course',()=>{
  const anchor=row(1,['애니메이션','은혼']),chosen={topics:['ANIME_MANGA'],subjects:['은혼']}
  expect(recommendedEvents([row(2,['애니메이션','은혼']),row(3,['애니메이션','주술회전']),row(4,['애니메이션','은혼'],'POPUP_RETAIL')],'2026-10-09','HONGDAE',anchor,'EVENT',[],chosen).map(x=>x.row.id)).toEqual([2])
 })
})
