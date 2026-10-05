import {describe,it,expect} from 'vitest'
import {eventStop,moveStop,operatingOn,planCalendar,planIssueDetails,planIssues,readPlans,recommendedEvents,validatePlan,writePlan,type Plan,type PlanStop} from './model'
import type {PublicEventSummary} from '../catalog/api'
const day='2026-10-09'
const stop=(change:Partial<PlanStop>={}):PlanStop=>({id:'a',kind:'EVENT',name:'공개 행사',address:'서울 성동구 연무장길 76',point:null,start:'13:00',duration:60,locked:true,note:'개인 예약 메모',url:'/discover/1',source:'CATALOG',...change})
const plan=(change:Partial<Plan>={}):Plan=>({version:1,id:'plan-a',title:'하루 일정',purpose:'EVENT',day,start:'12:00',end:'19:00',area:'SEONGSU',style:'VIEW',updatedAt:'2026-10-04T00:00:00Z',stops:[stop()],...change})
const row=(id:number,change:Partial<PublicEventSummary['event']>={}):PublicEventSummary=>({id,participantCount:0,event:{name:`행사 ${id}`,subcategory:'BIRTHDAY_CAFE',organizer:null,edition:null,region:'SEOUL',venueName:'카페',address:'서울 성동구 성수동',description:'',admission:null,subjects:['VOCALOID'],occurrences:[{startDate:day,endDate:day,startTime:'11:00',endTime:'18:00'}],sources:[],banners:[],warnings:[],...change}})
describe('private day itinerary rules',()=>{
 it('identifies the exact conflicting stop even when places have the same name',()=>{
  const details=planIssueDetails(plan({stops:[stop({id:'first'}),stop({id:'second',start:'13:30'})]}))
  expect(details.filter(issue=>issue.message.includes('겹쳐요')).map(issue=>issue.stopId)).toEqual(['second'])
  expect(planIssueDetails(plan({day:'2026-02-30'})).find(issue=>issue.message==='방문 날짜를 확인해 주세요.')?.stopId).toBeNull()
 })
 it('uses the selected operating day and location, including grouped editions',()=>{const root=row(1);root.operatingPlaces=[{eventId:2,event:row(2,{occurrences:[{startDate:'2026-10-10',endDate:'2026-10-10',startTime:null,endTime:null}]}).event},{eventId:3,event:row(3).event}];expect(operatingOn(root,day).map(p=>p.eventId)).toEqual([3])})
 it('excludes canceled events and dates outside the selected day',()=>{expect(operatingOn(row(1,{operationStatus:{state:'CANCELED',note:null,sourceUrl:null,checkedOn:null}}),day)).toEqual([]);expect(operatingOn(row(1),'2026-10-10')).toEqual([])})
 it('prioritizes shared topics while preserving the event purpose field',()=>{const anchor=row(1),same=row(2),other=row(3,{subjects:['ANIME_MANGA']}),popup=row(4,{subcategory:'POPUP_RETAIL'}),legacy=row(5,{subcategory:'POPUP_STORE'});expect(recommendedEvents([other,popup,legacy,same],day,'SEONGSU',anchor,'EVENT').map(c=>c.row.id)).toEqual([2,3])})
 it('keeps different event fields available for a date',()=>{expect(recommendedEvents([row(1),row(2,{subcategory:'POPUP_RETAIL'})],day,'SEONGSU',undefined,'DATE')).toHaveLength(2)})
 it('does not replace an unknown event location with a neighborhood center',()=>{expect(eventStop(row(1),day,'13:00').point).toBeNull()})
 it('includes verified nearby events across district borders and excludes distant same-district events',()=>{
  const anchor=row(1),neighbor=row(2,{address:'서울 광진구 자양동'}),far=row(3),center={lat:37.54,lng:127.06}
  const results=recommendedEvents([neighbor,far],day,'SEONGSU',anchor,'EVENT',[],undefined,{center,points:{2:{lat:37.54,lng:127.065},3:{lat:37.59,lng:127.09}}})
  expect(results.map(c=>c.row.id)).toEqual([2]);expect(results[0].reason).toContain('직선거리')
 })
 it('never moves fixed times when changing visit order',()=>{const first=stop(),last=stop({id:'b',start:'15:00',locked:false});const result=moveStop([first,last],'a',1);expect(result.map(s=>s.id)).toEqual(['b','a']);expect(result[1]).toEqual(first);expect(planIssues(plan({stops:result})).join(' ')).toContain('겹쳐요')})
 it('detects overlaps, day limits and venue hours independently',()=>{const p=plan({stops:[stop({start:'12:00',duration:90,occurrences:row(1,{occurrences:[{startDate:day,endDate:day,startTime:'13:00',endTime:'14:00'}]}).event.occurrences}),stop({id:'b',start:'13:00',duration:480})]});const errors=planIssues(p).join(' ');expect(errors).toContain('운영 시간');expect(errors).toContain('겹쳐요');expect(errors).toContain('하루 일정')})
 it('marks an event invalid after the itinerary date changes',()=>{expect(planIssues(plan({day:'2026-10-10',stops:[stop({occurrences:row(1).event.occurrences})]})).join(' ')).toContain('열리지 않아요')})
 it('does not claim unknown hours are a confirmed conflict',()=>{expect(planIssues(plan({stops:[stop({occurrences:row(1,{occurrences:[{startDate:day,endDate:day,startTime:null,endTime:null}]}).event.occurrences})]}))).toEqual([])})
 it('rejects malformed stored data and out-of-region coordinates',()=>{expect(validatePlan(plan({stops:[stop({point:{lat:0,lng:0}})]}))).toBe(false);expect(validatePlan({...plan(),day:'2026-02-30'})).toBe(false);expect(readPlans({getItem:()=>'{broken'},'x')).toEqual([])})
 it('skips corrupted occurrence metadata without losing other saved plans',()=>{const valid=plan(),broken={...plan(),id:'bad',stops:[{...stop(),occurrences:[null]}]};expect(validatePlan(broken)).toBe(false);expect(readPlans({getItem:()=>JSON.stringify([broken,valid])},'x')).toEqual([valid]);expect(validatePlan({...broken,stops:[{...stop(),occurrences:[{startDate:day,endDate:day,startTime:13,endTime:null}]}]})).toBe(false);expect(validatePlan(plan({stops:[stop(),stop()]}))).toBe(false)})
 it('keeps member and guest browser storage isolated and updates the same plan',()=>{const values=new Map<string,string>(),storage={getItem:(key:string)=>values.get(key)||null,setItem:(key:string,value:string)=>{values.set(key,value)}};writePlan(storage,'member:1',plan());expect(readPlans(storage,'guest')).toEqual([]);writePlan(storage,'member:1',plan({title:'수정'}));expect(readPlans(storage,'member:1')).toHaveLength(1);expect(readPlans(storage,'member:1')[0].title).toBe('수정')})
 it('surfaces failed explicit save instead of showing success',()=>{expect(()=>writePlan({getItem:()=>null,setItem:()=>{throw new Error('quota')}},'guest',plan())).toThrow('quota')})
 it('exports correct Korean time, escapes fields and omits private notes',()=>{const content=planCalendar(plan({stops:[stop({name:'행사,소개;\n둘째 줄'})]}));expect(content).toContain('DTSTART;TZID=Asia/Seoul:20261009T130000');expect(content).toContain('DTEND;TZID=Asia/Seoul:20261009T140000');expect(content).toContain('SUMMARY:행사\\,소개\\;\\n둘째 줄');expect(content).not.toContain('개인 예약 메모')})
 it('folds UTF-8 calendar lines and prevents export of conflicting schedules',()=>{const content=planCalendar(plan({stops:[stop({name:'아주 긴 행사 이름'.repeat(15)})]}));expect(content.split('\r\n').every(line=>new TextEncoder().encode(line).length<=75)).toBe(true);expect(()=>planCalendar(plan({stops:[stop({start:'23:00'})]}))).toThrow()})
})
