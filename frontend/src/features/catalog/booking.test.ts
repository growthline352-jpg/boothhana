import { describe,it,expect } from 'vitest'
import type { TicketInfo,EventData } from '../collection/api'
import { ticketBooking,eventBooking } from './booking'
const ticket=(overrides:Partial<TicketInfo>={}):TicketInfo=>({id:'t',name:'예약',visitDate:null,priceAmount:null,currency:null,salesStartsAt:'2026-10-01T12:00:00+09:00',salesEndsAt:'2026-10-02T20:00:00+09:00',entryTime:null,reservationUrl:'https://example.com',status:'PUBLISHED',note:null,sourceUrl:'https://example.com',checkedOn:'2026-10-03',...overrides})
describe('예약과 행사 일정 분리',()=>{
 it('uses a fresh official upcoming announcement even when the opening time is not published',()=>{
  expect(ticketBooking(ticket({salesStartsAt:null,salesEndsAt:null,bookingState:'UPCOMING'}),new Date('2026-10-03T03:00:00Z'))).toBe('UPCOMING')
  expect(ticketBooking(ticket({salesStartsAt:null,salesEndsAt:null,bookingState:'UPCOMING'}),new Date('2026-10-04T03:00:00Z'))).toBe('UNKNOWN')
 })
 it('closes at the actual timestamp independently of the host timezone',()=>{
  expect(ticketBooking(ticket(),new Date('2026-10-02T10:59:59Z'))).toBe('OPEN')
  expect(ticketBooking(ticket(),new Date('2026-10-02T11:00:00Z'))).toBe('CLOSED')
 })
 it('does not infer sold out, admission unavailable, or midnight closing from dates',()=>{
  expect(ticketBooking(ticket({salesEndsAt:'2026-10-03'}),new Date('2026-10-03T23:00:00+09:00'))).toBe('OPEN')
  expect(ticketBooking(ticket({salesEndsAt:'2026-10-03'}),new Date('2026-10-04T00:00:00+09:00'))).toBe('CLOSED')
  expect(ticketBooking(ticket({salesStartsAt:'2026-10-03',salesEndsAt:'2026-10-04'}),new Date('2026-10-03T12:00:00+09:00'))).toBe('UNKNOWN')
 })
 it('does not display stale accepting status without a known booking window',()=>{
  expect(ticketBooking(ticket({salesStartsAt:null,salesEndsAt:null,bookingState:'OPEN',checkedOn:'2026-10-01'}),new Date('2026-10-03T12:00:00+09:00'))).toBe('UNKNOWN')
  expect(ticketBooking(ticket({status:'UNKNOWN',bookingState:'CLOSED'}))).toBe('UNKNOWN')
 })
 it('limits partial-day closure to the relevant dates',()=>{
  const event={occurrences:[{startDate:'2026-10-03',endDate:'2026-10-04'}],visitorGuide:{tickets:[ticket({visitDate:'2026-10-03'})],coverage:[{kind:'TICKETS',status:'PARTIAL'}]}} as EventData
  const now=new Date('2026-10-03T12:00:00+09:00')
  expect(eventBooking(event,'',now)?.label).toBe('일부 일정 예약 종료')
  expect(eventBooking(event,'2026-10-04',now)).toBeNull()
 })
 it('keeps running events visible when all advance reservations ended',()=>{
  const event={occurrences:[{startDate:'2026-10-03',endDate:'2026-10-04'}],visitorGuide:{tickets:[ticket({visitDate:'2026-10-03'}),ticket({id:'sunday',visitDate:'2026-10-04'})],coverage:[{kind:'TICKETS',status:'PUBLISHED'}]}} as EventData
  expect(eventBooking(event,'',new Date('2026-10-03T12:00:00+09:00'))?.label).toBe('사전예약 종료')
  expect(event.occurrences[0].endDate).toBe('2026-10-04')
 })
})
