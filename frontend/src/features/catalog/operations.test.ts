import { describe, expect, it } from 'vitest'
import { presentPublicParticipant, type PublicEvent, type PublicEventSummary, type PublicParticipant } from './api'
import { combineOperatingDetails, combineOperatingSummaries, operatingEventsForDay, selectOperatingEvent } from './eventGroup'
import { emptyVisitorGuide, visitorGuideError } from './visitorGuideEditing'
import { locationEditError, withDateEvidence } from '../visit/locationEditing'
import type { TicketInfo } from '../collection/api'

const dates=[{startDate:'2026-10-03',endDate:'2026-10-04',startTime:null,endTime:null}]
const ticket:TicketInfo={id:'t1',name:'일반권',visitDate:'2026-10-03',priceAmount:null,currency:null,salesStartsAt:null,salesEndsAt:null,entryTime:null,reservationUrl:null,status:'UNKNOWN',note:null,sourceUrl:null,checkedOn:null}
const event=(id:number,day:string,venueName:string)=>({id,event:{name:'운영일 '+id,venueName,occurrences:[{startDate:day,endDate:day,startTime:null,endTime:null}]},participants:[{id:id*10}],participantCount:1,assets:[]} as unknown as PublicEvent & PublicEventSummary)

describe('operations editing safety',()=>{
 it('keeps explicit editorial sales text while collected summaries still use product evidence',()=>{
  const row={id:91,participant:{registrationName:'테스트 부스',members:[],subjects:[]},sales:{summary:'선입금 마감은 금요일 18시입니다.',products:[],categories:[],subjects:[]},salesSummaryOrigin:'EDITORIAL'} as unknown as PublicParticipant
  expect(presentPublicParticipant(row).sales?.summary).toBe(row.sales?.summary)
  expect(presentPublicParticipant({...row,salesSummaryOrigin:'COLLECTED'}).sales?.summary).not.toBe(row.sales?.summary)
 })
 it('clears asserted dates when evidence becomes unknown and requires both dates for confirmed evidence',()=>{
  const location={status:'ASSIGNED',code:'A1',hall:'1관',zone:null,floorPlanUrl:null,startDate:'2026-10-03',endDate:'2026-10-04',dateEvidence:'DECLARED' as const}
  expect(withDateEvidence(location,'UNKNOWN')).toMatchObject({code:'A1',hall:'1관',startDate:null,endDate:null,dateEvidence:'UNKNOWN'})
  expect(locationEditError([withDateEvidence(withDateEvidence(location,'UNKNOWN'),'ROSTER')])).not.toBeNull()
  expect(locationEditError([location])).toBeNull()
  expect(locationEditError([{...location,startDate:'2026-10-05'}])).not.toBeNull()
 })
 it('blocks confirmed facts without provenance and stale ticket references',()=>{
  expect(visitorGuideError({...emptyVisitorGuide,tickets:[ticket]},dates)).toBeNull()
  expect(visitorGuideError({...emptyVisitorGuide,tickets:[{...ticket,status:'PUBLISHED'}]},dates)).not.toBeNull()
  expect(visitorGuideError({...emptyVisitorGuide,tickets:[{...ticket,reservationUrl:'https://example.com'}]},dates)).not.toBeNull()
  expect(visitorGuideError({...emptyVisitorGuide,faq:[{id:'f1',question:'재입장?',answer:'가능',status:'UNKNOWN',sourceUrl:null,checkedOn:null}]},dates)).not.toBeNull()
 })
 it('preserves date-only precision and compares mixed sales times on the Korea calendar',()=>{
  const check=(salesStartsAt:string,salesEndsAt:string)=>visitorGuideError({...emptyVisitorGuide,tickets:[{...ticket,salesStartsAt,salesEndsAt}]},dates)
  expect(check('2026-10-02T23:00:00+09:00','2026-10-02')).toBeNull()
  expect(check('2026-10-01T20:00:00Z','2026-10-02')).toBeNull()
  expect(check('2026-10-02T20:00:00Z','2026-10-02')).not.toBeNull()
  expect(check('2026-10-02T23:00:00+09:00','2026-10-02T22:00:00+09:00')).not.toBeNull()
 })
})

describe('generic operating groups',()=>{
 const a=event(91,'2026-10-03','1관'),b=event(97,'2026-10-04','2관'),c=event(103,'2026-10-04','3관')
 const group={rootEventId:91,name:'같은 회차',members:[a,b,c].map(r=>({eventId:r.id,name:r.event.name,venueName:r.event.venueName,occurrences:r.event.occurrences}))}
 const rows=[a,b,c].map(r=>({...r,operatingGroup:group}))
 it('combines dates without copying booths or changing source IDs',()=>{
  const combined=combineOperatingDetails(rows[0],rows)
  expect(combined.id).toBe(91)
  expect(combined.event.occurrences).toHaveLength(2)
  expect(combined.participants).toEqual(a.participants)
  expect(selectOperatingEvent(rows,'2026-10-04',null).id).toBe(97)
  expect(operatingEventsForDay(rows,'2026-10-04').map(r=>r.id)).toEqual([97,103])
  expect(selectOperatingEvent(rows,'2026-10-04','103').participants).toEqual(c.participants)
 })
 it('does not introduce out-of-filter dates and handles an unavailable root',()=>{
  const combined=combineOperatingSummaries(rows.slice(1))
  expect(combined).toHaveLength(1)
  expect(combined[0]).toMatchObject({id:97,participantCount:2})
  expect(combined[0].event.occurrences.map(d=>d.startDate)).toEqual(['2026-10-04'])
 })
})
