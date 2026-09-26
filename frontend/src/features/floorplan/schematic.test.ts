import { describe, expect, it } from 'vitest'
import type { EventData, PublicParticipant } from '../catalog/api'
import { generateSchematicPlan } from './schematic'

const event = {
  occurrences: [{startDate:'2026-10-03',endDate:'2026-10-03',startTime:'11:00',endTime:'16:00'}],
} as EventData

function participant(id:number,code:string):PublicParticipant {
  return {id,sales:null,participant:{sourceEntryId:String(id),registrationName:`부스 ${id}`,kind:'CIRCLE',members:[],subjects:[],officialLinks:[],sources:[],images:[],warnings:[],locations:[{code,status:'ASSIGNED',hall:null,zone:null,startDate:'2026-10-03',endDate:'2026-10-03',floorPlanUrl:null}]}}
}

describe('generateSchematicPlan',()=>{
  it('automatically places published booth codes and links participants',()=>{
    const plan=generateSchematicPlan(event,[participant(1,'A-01'),participant(2,'B-12a')],'2026-10-03','', 'https://example.com/map')
    expect(plan?.schematic).toBe(true)
    expect(plan?.shapes.map(shape=>shape.label)).toEqual(['A-01','B-12A'])
    expect(plan?.shapes[1].links).toEqual([{participantId:2,dates:['2026-10-03'],method:'PUBLIC_BOOTH_CODE'}])
    expect(plan?.shapes.every(shape=>shape.points.every(point=>point.x>=0&&point.x<=1&&point.y>=0&&point.y<=1))).toBe(true)
  })

  it('merges multiple public participants assigned to the same booth',()=>{
    const plan=generateSchematicPlan(event,[participant(1,'D-25a'),participant(2,'D-25a')],'2026-10-03','', 'https://example.com/map')
    expect(plan?.shapes).toHaveLength(1)
    expect(plan?.shapes[0].links.map(link=>link.participantId)).toEqual([1,2])
  })

  it('does not invent a map without an assigned public booth code',()=>{
    const row=participant(1,'')
    expect(generateSchematicPlan(event,[row],'2026-10-03','', 'https://example.com/map')).toBeNull()
  })
})
