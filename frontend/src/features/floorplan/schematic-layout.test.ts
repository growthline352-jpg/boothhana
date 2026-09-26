import { describe, expect, it } from 'vitest'
import type { EventData, PublicParticipant } from '../catalog/api'
import { generateSchematicPlan } from './schematic'

const event = {occurrences:[{startDate:'2026-10-03',endDate:'2026-10-03',startTime:'11:00',endTime:'16:00'}]} as EventData
const participant:PublicParticipant = {id:44,sales:null,participant:{sourceEntryId:'172257',registrationName:'모나',kind:'CIRCLE',members:[],subjects:[],officialLinks:[],sources:[],images:[],warnings:[],locations:[{code:'D-25a',status:'ASSIGNED',hall:null,zone:null,startDate:'2026-10-03',endDate:'2026-10-03',floorPlanUrl:null}]}}

describe('official source layout schematic',()=>{
  it('keeps every official position and links only collected booth data',()=>{
    const plan=generateSchematicPlan(event,[participant],'2026-10-03','', 'https://dongne.co/events/df2610/map')!
    expect(plan.shapes).toHaveLength(771)
    expect(plan.shapes.find(shape=>shape.label==='D-25A')?.links[0]?.participantId).toBe(44)
    expect(plan.shapes.find(shape=>shape.label==='A-16')?.links).toEqual([])
    expect(plan.shapes.every(shape=>shape.points.every(point=>point.x>=0&&point.x<=1&&point.y>=0&&point.y<=1))).toBe(true)
  })
})
