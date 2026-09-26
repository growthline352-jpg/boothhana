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

  it('shows every official Sunday position even before participant details are collected',()=>{
    const sunday={occurrences:[{startDate:'2026-10-04',endDate:'2026-10-04',startTime:'11:00',endTime:'16:00'}]} as EventData
    const plan=generateSchematicPlan(sunday,[],'2026-10-04','', 'https://dongne.co/events/wt03/map')!
    expect(plan.shapes).toHaveLength(848)
    expect(plan.shapes.every(shape=>shape.links.length===0)).toBe(true)
    expect(plan.credit).toContain('공식 부스번호')
  })

  it('uses the official Jipconomy plan when the catalog only has the Coex event source',()=>{
    const expo={occurrences:[{startDate:'2026-09-30',endDate:'2026-10-01',startTime:'10:00',endTime:'17:00'}]} as EventData
    const coex='https://www.coex.co.kr/exhibitions/%EC%A0%9C12%ED%9A%8C-%EC%A7%91%EC%BD%94%EB%85%B8%EB%AF%B8-%EB%B0%95%EB%9E%8C%ED%9A%8C-2026/'
    const plan=generateSchematicPlan(expo,[],'2026-09-30','',coex)!
    expect(plan.shapes).toHaveLength(40)
    expect(plan.shapes.find(shape=>shape.label==='E-02')).toBeUndefined()
    expect(plan.sourceUrl).toBe('https://jipconomy.kr/booth/')
  })
})
