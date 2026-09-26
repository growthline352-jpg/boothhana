import { describe, expect, it } from 'vitest'
import type { PublicParticipant } from '../catalog/api'
import { matchesFloorplanSearch } from './mapSearch'

const person:PublicParticipant={id:44,sales:null,participant:{sourceEntryId:'172257',registrationName:'모나',kind:'CIRCLE',members:[],subjects:['창작물'],officialLinks:[],sources:[],images:[],warnings:[],locations:[{code:'D-25a',status:'ASSIGNED',hall:null,zone:null,startDate:'2026-10-03',endDate:'2026-10-03',floorPlanUrl:null}]}}

describe('matchesFloorplanSearch',()=>{
  it('finds a position by booth code regardless of punctuation case',()=>{
    expect(matchesFloorplanSearch('D-25A',[],'d-25a','2026-10-03','')).toBe(true)
  })

  it('finds a linked booth by its public name',()=>{
    expect(matchesFloorplanSearch('D-25A',[person],'모나','2026-10-03','')).toBe(true)
    expect(matchesFloorplanSearch('D-25A',[person],'없는 부스','2026-10-03','')).toBe(false)
  })
})
