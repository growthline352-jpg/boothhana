import { describe, expect, it } from 'vitest'
import type { PublicEvent, PublicEventSummary } from './api'
import { combineDfesta, combineDfestaSummaries } from './eventGroup'

const day = (id: number, name: string, date: string, count: number): PublicEventSummary => ({
  id, participantCount: count, event: {
    name, occurrences: [{startDate:date,endDate:date,startTime:'11:00',endTime:'16:00'}],
  } as PublicEventSummary['event'],
})

describe('디페스타 회차 표시', () => {
  const saturday=day(1,'제35회 디. 페스타 (토요일)','2026-10-03',709)
  const sunday=day(7,'제35회 디. 페스타 (일요일)','2026-10-04',505)

  it('목록에서 두 회차를 한 카드와 두 운영일로 표시한다', () => {
    const rows=combineDfestaSummaries([saturday,sunday])
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(1)
    expect(rows[0].event.name).toBe('제35회 디. 페스타')
    expect(rows[0].event.occurrences).toHaveLength(2)
    expect(rows[0].participantCount).toBe(1214)
  })

  it('일요일만 검색된 경우에도 대표 행사로 연결한다', () => {
    expect(combineDfestaSummaries([sunday])[0].id).toBe(1)
  })

  it('서로 다른 행사 데이터는 합치지 않는다', () => {
    expect(combineDfestaSummaries([day(7,'다른 행사','2026-10-04',1)])).toHaveLength(1)
    expect(combineDfestaSummaries([day(7,'다른 행사','2026-10-04',1)])[0].id).toBe(7)
  })

  it('상세에서 날짜만 묶고 참가자 원본은 유지한다', () => {
    const first={...saturday,participants:[{id:101}],assets:[]} as unknown as PublicEvent
    const second={...sunday,participants:[{id:701}],assets:[]} as unknown as PublicEvent
    const combined=combineDfesta(first,second)
    expect(combined.event.occurrences).toHaveLength(2)
    expect(combined.participants.map(p=>p.id)).toEqual([101])
  })
})
