import {describe,it,expect} from 'vitest'
import {visitCalendar} from './calendarExport'
import type {EventData} from '../collection/api'
const event={name:'행사, 이름\nEND:VEVENT',venueName:'성수',address:'서울 성동구',occurrences:[{startDate:'2026-10-10',endDate:'2026-10-11',startTime:'10:00',endTime:'18:00'}]} as EventData
describe('visit calendar export',()=>{
 it('uses KST dates and time, with no private notes or identifiers',()=>{const result=visitCalendar(event,4,'2026-10-11',new Date('2026-10-04T00:00:00Z'));expect(result).toContain('DTSTART:20261011T010000Z');expect(result).toContain('DTEND:20261011T090000Z');expect(result).toContain('SUMMARY:행사\\, 이름\\nEND:VEVENT');expect(result.match(/\r\nEND:VEVENT/g)).toHaveLength(1)})
 it('uses exclusive all-day end when hours are not confirmed',()=>{const result=visitCalendar({...event,occurrences:[{...event.occurrences[0],startTime:null}]},4,'2026-10-10');expect(result).toContain('DTSTART;VALUE=DATE:20261010');expect(result).toContain('DTEND;VALUE=DATE:20261011')})
 it('rejects a moved date and canceled events',()=>{expect(()=>visitCalendar(event,4,'2026-10-12')).toThrow();expect(()=>visitCalendar({...event,operationStatus:{state:'CANCELED',note:null,sourceUrl:null,checkedOn:null}},4,'2026-10-10')).toThrow()})
 it('folds Korean Unicode lines without splitting characters or exceeding 75 bytes',()=>{const result=visitCalendar({...event,name:'서울 팝업 행사 '.repeat(50)},4,'2026-10-10');for(const line of result.split('\r\n'))expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);expect(result.replace(/\r\n /g,'')).toContain('SUMMARY:'+'서울 팝업 행사 '.repeat(50))})
})
