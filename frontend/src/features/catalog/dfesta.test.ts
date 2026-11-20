import { describe, expect, it } from 'vitest'
import type { PublicEvent, PublicEventSummary } from './api'
import { combineDfesta, combineDfestaSummaries } from './dfesta'

const event = (id:number, day:string): PublicEvent => ({
  id, mode:'INFO_ONLY', publishedAt:'2026-09-29T00:00:00Z', banner:null, assets:[], participants:[{id:id*100,participant:{locations:[]},sales:null} as unknown as PublicEvent['participants'][number]],
  event:{name:`제35회 디. 페스타 (${id===1?'토요일':'일요일'})`,description:`${day} 안내`,occurrences:[{startDate:day,endDate:day,startTime:'11:00',endTime:'16:00'}],sources:[],warnings:[],discoveryLinks:[]} as unknown as PublicEvent['event'],
})

describe('35회 디페스타 요일별 공개 데이터',()=>{
  it('keeps one event and both original participant IDs',()=>{
    const saturday=event(1,'2026-10-03'),sunday=event(7,'2026-10-04')
    const grouped=combineDfesta(saturday,sunday)
    expect(grouped.id).toBe(1)
    expect(grouped.event.name).toBe('제35회 디. 페스타')
    expect(grouped.event.occurrences.map(o=>o.startDate)).toEqual(['2026-10-03','2026-10-04'])
    expect(grouped.participants.map(p=>p.id)).toEqual([100,700])
    expect(saturday.event.name).toContain('토요일')
  })
  it('shows one list card whether one or both source days are on a page',()=>{
    const rows=[1,7].map((id,index)=>({id,event:event(id,index?'2026-10-04':'2026-10-03').event,participantCount:index?505:709} as PublicEventSummary))
    expect(combineDfestaSummaries(rows).map(row=>row.id)).toEqual([1])
    expect(combineDfestaSummaries(rows)[0].participantCount).toBe(1214)
    expect(combineDfestaSummaries([rows[1]])[0].id).toBe(1)
    expect(combineDfestaSummaries([rows[1]])[0].participantCount).toBe(0)
  })
})
