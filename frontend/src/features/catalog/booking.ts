import type { EventData, TicketInfo } from '../collection/api'

export type BookingState = 'UNKNOWN'|'UPCOMING'|'OPEN'|'CLOSED'|'SOLD_OUT'
export const bookingLabels:Record<BookingState,string>={UNKNOWN:'예약 상태 확인 필요',UPCOMING:'예매 예정',OPEN:'예약 중',CLOSED:'사전예약 종료',SOLD_OUT:'매진'}
const seoulDay=(now:Date)=>new Date(now.getTime()+9*3600000).toISOString().slice(0,10)
function boundary(value:string|null,end:boolean):number|null {
  if(!value)return null
  if(/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    // A date without a time is not evidence of midnight closure.
    const midnight=Date.parse(value+'T00:00:00+09:00')
    return Number.isFinite(midnight)?midnight+(end?86400000:0):null
  }
  if(!/(Z|[+-]\d{2}:\d{2})$/.test(value))return null
  const stamp=Date.parse(value);return Number.isFinite(stamp)?stamp:null
}
export function ticketBooking(t:TicketInfo,now=new Date()):BookingState {
  if(!['PUBLISHED','SOLD_OUT'].includes(t.status)||!t.sourceUrl||!t.checkedOn)return 'UNKNOWN'
  const start=boundary(t.salesStartsAt,false),end=boundary(t.salesEndsAt,true),time=now.getTime()
  if(end!==null&&time>=end)return 'CLOSED'
  if(t.bookingState==='CLOSED')return 'CLOSED'
  if(t.bookingState==='SOLD_OUT'||t.status==='SOLD_OUT')return 'SOLD_OUT'
  if(start!==null&&time<start)return 'UPCOMING'
  // Unknown opening time on today's date must not appear as accepting bookings.
  if(t.salesStartsAt?.length===10&&t.salesStartsAt===seoulDay(now))return 'UNKNOWN'
  if(start!==null&&end!==null&&time>=start&&time<end)return 'OPEN'
  if(t.bookingState==='OPEN'&&t.checkedOn===seoulDay(now))return 'OPEN'
  return 'UNKNOWN'
}
export function eventBooking(event:EventData,day='',now=new Date()):{state:BookingState;label:string}|null {
  const all=event.visitorGuide?.tickets??[]
  const tickets=all.filter(t=>!day||!t.visitDate||t.visitDate===day)
  if(!tickets.length)return null
  const states=tickets.map(t=>ticketBooking(t,now))
  const state=states.includes('OPEN')?'OPEN':states.every(s=>s==='CLOSED')?'CLOSED':states.every(s=>s==='SOLD_OUT')?'SOLD_OUT':states.every(s=>s==='UPCOMING')?'UPCOMING':states.includes('CLOSED')?'CLOSED':states.includes('SOLD_OUT')?'SOLD_OUT':'UNKNOWN'
  if(state==='UNKNOWN')return null
  const covered=event.visitorGuide?.coverage?.find(c=>c.kind==='TICKETS')?.status==='PUBLISHED'
  const complete=covered&&states.every(s=>s===state)&&(!!day||tickets.some(t=>!t.visitDate)||event.occurrences.every(o=>{
    for(let date=o.startDate;date<=o.endDate;date=new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10))if(!tickets.some(t=>t.visitDate===date))return false
    return true
  }))
  return {state,label:complete?bookingLabels[state]:`${day?'선택일 일부':'일부 일정'} ${state==='CLOSED'?'예약 종료':state==='SOLD_OUT'?'매진':state==='OPEN'?'예약 중':'예매 예정'}`}
}
