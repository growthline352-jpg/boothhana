import {describe,it,expect} from 'vitest'
import {fitTimes,readWizardDraft,type WizardDraft} from './wizard'
import {planIssues,type Plan,type PlanStop} from './model'
const day='2026-10-05'
const stop=(id:string,change:Partial<PlanStop>={}):PlanStop=>({id,kind:'FOOD',name:id,address:'서울 성동구',point:null,start:'13:00',duration:60,locked:false,note:'',url:'',source:'MANUAL',...change})
const plan=(stops:PlanStop[]):Plan=>({version:1,id:'p',title:'코스',purpose:'EVENT',day,start:'10:00',end:'19:00',area:'SEOUL_SEONGDONG',style:'VIEW',stops,updatedAt:'2026-10-05T00:00:00Z'})
describe('wizard recovery and editable times',()=>{
 it('recovers the wizard step, anchor and chosen companions without uploading them',()=>{
  const value:WizardDraft={version:1,plan:plan([stop('meal')]),step:5,anchorId:381,anchorTime:'11:00',duration:90,field:'POPUP',query:'팝업',updatedAt:'2026-10-05T00:00:00Z'}
  expect(readWizardDraft({getItem:()=>JSON.stringify(value)},'guest')).toEqual(value)
  for(const change of [{step:6},{anchorId:-1},{duration:0},{anchorTime:'29:00'},{field:'OTHER'},{plan:{...value.plan,stops:[null]}}])expect(readWizardDraft({getItem:()=>JSON.stringify({...value,...change})},'guest')).toBeNull()
  expect(readWizardDraft({getItem:()=>'{broken'},'guest')).toBeNull()
 })
 it('fits unlocked visits after a fixed booking with a 30 minute buffer',()=>{
  const fixed=stop('event',{kind:'EVENT',start:'11:00',locked:true,duration:90}),p=plan([fixed,stop('meal'),stop('cafe',{duration:45})])
  const result=fitTimes(p)
  expect(result.stops[0]).toEqual(fixed)
  expect(result.stops.map(s=>s.start)).toEqual(['11:00','13:00','14:30'])
  expect(planIssues(result)).toEqual([])
 })
 it('uses actual occurrence windows and does not move a fixed visit',()=>{
  const event=stop('exhibit',{kind:'EVENT',occurrences:[{startDate:day,endDate:day,startTime:'12:00',endTime:'16:00'}]})
  expect(fitTimes(plan([event])).stops[0].start).toBe('12:00')
  const fixed=stop('booking',{locked:true,start:'15:00'})
  expect(fitTimes(plan([stop('lunch'),fixed])).stops[1]).toEqual(fixed)
 })
 it('preserves an impossible slot for explicit conflict review instead of silently deleting it',()=>{
  const p=plan([stop('long',{duration:480}),stop('booking',{start:'11:00',locked:true})])
  const result=fitTimes(p)
  expect(result.stops[0]).toEqual(p.stops[0]);expect(result.stops).toHaveLength(2)
  expect(planIssues(result).join(' ')).toContain('겹쳐요')
 })
})
