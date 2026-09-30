import { describe, expect, it } from 'vitest'
import type { PublicParticipant } from '../catalog/api'
import type { PublicPlan } from './api'
import { planApplies } from './InteractiveFloorPlans'

const day='2026-11-11'
const people=[
  {id:1,participant:{locations:[{hall:'A홀'}]}},
  {id:2,participant:{locations:[{hall:'D홀'}]}},
] as PublicParticipant[]
const map=(title:string,participantId:number):PublicPlan=>({
  id:title,assetId:1,state:'READY',publishedAt:'',sourceUrl:'',credit:'',imageUrl:null,
  scope:{hall:null,zone:null,dates:[day],title},
  shapes:[{id:'booth',label:'A1',points:[],status:'MATCHED',issues:[],links:[{participantId,dates:[day],method:'EXACT'}]}],
})

describe('multi-hall floorplan selection',()=>{
  it('shows a shared floorplan for either hall represented by its linked booths',()=>{
    const first=map('1층 A·B홀',1)
    const third=map('3층 C·D홀',2)
    expect(planApplies(first,day,'A홀',people)).toBe(true)
    expect(planApplies(first,day,'D홀',people)).toBe(false)
    expect(planApplies(third,day,'D홀',people)).toBe(true)
    expect(planApplies(third,'2026-11-15','D홀',people)).toBe(false)
  })
})
