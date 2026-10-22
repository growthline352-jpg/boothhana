import {expect,it,vi} from 'vitest'
import {PersonalPlanStore,type PlanTransport} from '../itinerary/PersonalPlanStore'
import {validatePlan} from '../itinerary/model'
import {publicSnapshot} from '../itinerary/sharing'
import type {StoredPlan} from '../itinerary/personalApi'
import {OutingsAccountStore} from './OutingsAccountStore'
import {fromAccountPlan,toAccountPlan} from './accountAdapter'
import {freshState,newPlan,newStop,storageKey,validPlan,type Place} from './model'

const place:Place={id:'custom-cafe',name:'함께 갈 카페',kind:'cafe',area:'성수',address:'서울 성동구',description:'개인 장소 설명',image:'',tags:[],hours:[],duration:60,cost:14000,indoor:true,booking:'개인 예약 정보',source:'custom'}
function fixture(){const p=newPlan('2026-10-24');p.stops=[{...newStop(place),note:'private note',done:true}];return p}
function storage(){const rows=new Map<string,string>();return {getItem:(k:string)=>rows.get(k)??null,setItem:(k:string,v:string)=>{rows.set(k,v)}}}
function transport(initial:StoredPlan[]=[]){
 let rows=structuredClone(initial)
 const api:PlanTransport={list:vi.fn(async()=>structuredClone(rows)),save:vi.fn(async(plan,revision)=>{
  const old=rows.find(r=>r.plan.id===plan.id);if((old?.revision??0)!==revision)throw Object.assign(Error('conflict'),{status:409})
  const next={plan:structuredClone(plan),revision:revision+1,updatedAt:plan.updatedAt};rows=[next,...rows.filter(r=>r.plan.id!==plan.id)];return next
 }),remove:vi.fn(async id=>{rows=rows.filter(r=>r.plan.id!==id)})};return api
}
const ready=async(s:OutingsAccountStore)=>{await vi.waitFor(()=>expect(s.read().ready).toBe(true))}
it('roundtrips optional times, manual travel, costs, fixed reservations and visit checks without guessing',()=>{
 const p=fixture();p.stops.push({...newStop({...place,id:'walk',kind:'walk'}),travel:25,fixed:'16:00'})
 const document=toAccountPlan(p);expect(validatePlan(document)).toBe(true);expect(document.start).toBe('');expect(document.stops[0].start).toBe('')
 expect(fromAccountPlan(document)).toEqual(p);expect(validPlan(fromAccountPlan(document))).toBe(true)
})
it('preserves legacy purpose, interests, source and explicit visit times in the shared format',()=>{
 const p=toAccountPlan(fixture());delete p.planner;delete p.stops[0].outing;p.start='13:00';p.end='19:00';p.stops[0].start='14:00';p.purpose='EVENT';p.stops[0].source='KAKAO';p.interests={topics:['작품'],subjects:[]}
 const converted=fromAccountPlan(p),back=toAccountPlan(converted,p)
 expect(converted.stops[0].fixed).toBe('14:00');expect(back.purpose).toBe('EVENT');expect(back.interests).toEqual(p.interests);expect(back.stops[0].source).toBe('KAKAO')
})
it('shares only explicit public fields and strips private visits, budgets, extra fields and notes by default',()=>{
 const p=toAccountPlan(fixture());Object.assign(p.stops[0].outing!,{accountEmail:'private@example.test'})
 const snapshot=publicSnapshot(p),body=JSON.stringify(snapshot)
 expect(body).not.toContain('private note');expect(body).not.toContain('private@example.test');expect(body).not.toContain('개인 예약');expect(snapshot.stops[0].outing?.done).toBe(false);expect(snapshot.stops[0].outing?.cost).toBeNull()
 expect(publicSnapshot(p,true).stops[0].note).toBe('private note')
})
it('saves through the same personal store and another browser reads the same account document',async()=>{
 const api=transport(),disk=storage(),personal=new PersonalPlanStore(api,disk),a=new OutingsAccountStore(api,disk,personal);a.bind('member:7');await ready(a)
 const p=fixture();a.write({...freshState(),plans:[p],activeId:p.id});await a.save(p.id)
 expect(api.save).toHaveBeenCalledWith(expect.objectContaining({planner:'OUTINGS',id:p.id}),0,7)
 expect(personal.read().records[0].plan.id).toBe(p.id);expect(a.read().dirtyIds).toEqual([])
 const b=new OutingsAccountStore(api,storage());b.bind('member:7');await ready(b);expect(b.read().state.plans[0]).toEqual(p)
})
it('does not send drafts until save and never exposes them to another account',async()=>{
 const api=transport(),disk=storage(),a=new OutingsAccountStore(api,disk);a.bind('member:7');await ready(a)
 const p=fixture();a.write({...freshState(),plans:[p],activeId:p.id});expect(api.save).not.toHaveBeenCalled()
 a.bind('member:8');await ready(a);expect(a.read().state.plans).toEqual([])
 a.bind('member:7');await ready(a);expect(a.read().state.plans[0]).toEqual(p)
})
it('a stale account save cannot overwrite a refreshed revision and keeps the draft for recovery',async()=>{
 const p=fixture(),api=transport([{plan:toAccountPlan(p),revision:2,updatedAt:p.updatedAt}]),disk=storage(),a=new OutingsAccountStore(api,disk);a.bind('member:7');await ready(a)
 a.write({...a.read().state,plans:[{...p,title:'my edit'}]});vi.mocked(api.save).mockRejectedValue(Object.assign(Error('other device'),{status:409}))
 await expect(a.save(p.id)).rejects.toThrow('other device');await a.refresh();await expect(a.save(p.id)).rejects.toThrow()
 expect(vi.mocked(api.save).mock.calls.every(c=>c[1]===2)).toBe(true);expect(a.read().state.plans[0].title).toBe('my edit');expect(a.read().conflict).toBe(true)
 a.useLatest(p.id);expect(a.read().state.plans[0].title).toBe(p.title)
})
it('keeps edits made while save is in flight and advances only their acknowledged base revision',async()=>{
 const api=transport(),a=new OutingsAccountStore(api,storage());a.bind('member:7');await ready(a);const p=fixture();a.write({...freshState(),plans:[p],activeId:p.id})
 let finish!:(r:StoredPlan)=>void;vi.mocked(api.save).mockImplementationOnce(()=>new Promise(r=>{finish=r}))
 const save=a.save(p.id);await vi.waitFor(()=>expect(api.save).toHaveBeenCalledTimes(1));a.write({...a.read().state,plans:[{...p,title:'after request'}]})
 finish({plan:toAccountPlan(p),revision:1,updatedAt:p.updatedAt});await save;expect(a.read().state.plans[0].title).toBe('after request');expect(a.read().dirtyIds).toEqual([p.id])
 vi.mocked(api.save).mockImplementation(async plan=>({plan,revision:2,updatedAt:plan.updatedAt}));await a.save(p.id);expect(vi.mocked(api.save).mock.calls[1][1]).toBe(1)
})
it('a save completing after account switch cannot write the next account state',async()=>{
 const api=transport(),a=new OutingsAccountStore(api,storage());a.bind('member:7');await ready(a);const p=fixture();a.write({...freshState(),plans:[p],activeId:p.id})
 let finish!:(r:StoredPlan)=>void;vi.mocked(api.save).mockImplementationOnce(()=>new Promise(r=>{finish=r}));const save=a.save(p.id);await vi.waitFor(()=>expect(api.save).toHaveBeenCalledTimes(1))
 a.bind('member:8');await ready(a);finish({plan:toAccountPlan(p),revision:1,updatedAt:p.updatedAt});await expect(save).rejects.toThrow('계정');expect(a.read().state.plans).toEqual([])
})
it('imports browser plans once and preserves the original after acknowledgement',async()=>{
 const api=transport(),disk=storage(),p=fixture();disk.setItem(storageKey,JSON.stringify({...freshState(),plans:[p],activeId:p.id}))
 const a=new OutingsAccountStore(api,disk);a.bind('member:7');await ready(a);await vi.waitFor(()=>expect(a.read().imports).toHaveLength(1));await a.importOne(a.read().imports[0].key)
 await vi.waitFor(()=>expect(a.read().imports).toEqual([]));expect(a.read().state.plans).toHaveLength(1);expect(JSON.parse(disk.getItem(storageKey)!).plans[0].id).toBe(p.id)
 const b=new OutingsAccountStore(api,disk);b.bind('member:7');await ready(b);await vi.waitFor(()=>expect(b.read().imports).toEqual([]));expect(api.save).toHaveBeenCalledTimes(1)
})

it('reloads a saved account plan from the same disk without invalidating the selected server record',async()=>{
 const api=transport(),disk=storage(),a=new OutingsAccountStore(api,disk);a.bind('member:7');await ready(a);const p=fixture();a.write({...freshState(),plans:[p],activeId:p.id});await a.save(p.id)
 a.bind('');const b=new OutingsAccountStore(api,disk);b.bind('member:7');await ready(b);expect(b.read().error).toBe('');expect(b.read().state.activeId).toBe(p.id);expect(b.read().state.plans[0]).toEqual(p)
})
it('guest saved schedules use the existing guest list and can be explicitly imported after login',async()=>{
 const api=transport(),disk=storage(),a=new OutingsAccountStore(api,disk);a.bind('guest');await ready(a);const p=fixture();a.write({...freshState(),plans:[p],activeId:p.id});await a.save(p.id)
 expect(api.save).not.toHaveBeenCalled();a.bind('');const b=new OutingsAccountStore(api,disk);b.bind('guest');await ready(b);expect(b.read().state.plans[0]).toEqual(p)
 b.bind('member:7');await ready(b);await vi.waitFor(()=>expect(b.read().imports).toHaveLength(1));expect(api.save).not.toHaveBeenCalled();await b.importOne(b.read().imports[0].key);expect(api.save).toHaveBeenCalledTimes(1)
})
it('saving establishes a new undo boundary so later edits save against the acknowledged revision',async()=>{
 const api=transport(),a=new OutingsAccountStore(api,storage());a.bind('member:7');await ready(a);const p=fixture();a.write({...freshState(),plans:[p],activeId:p.id});a.write({...a.read().state,plans:[{...p,title:'B'}]});await a.save(p.id);expect(a.canUndo).toBe(false)
 a.write({...a.read().state,plans:[{...p,title:'C'}]});a.undo();a.write({...a.read().state,plans:[{...p,title:'D'}]});await a.save(p.id);expect(vi.mocked(api.save).mock.calls[1][1]).toBe(1)
})
it('normalizes HTTP official links without losing account or share-management validation',()=>{
 const p=fixture();p.stops[0].place.sourceUrl='http://example.test/official';const document=toAccountPlan(p);expect(validatePlan(document)).toBe(true);expect(document.stops[0].outing?.sourceUrl).toBeUndefined();expect(validatePlan(publicSnapshot(document))).toBe(true)
})
it('retains the original fixed reservation when the computed arrival is later',()=>{
 const p=fixture();p.start='15:00';p.stops[0].fixed='14:00';const document=toAccountPlan(p);expect(document.stops[0].start).toBe('15:00');expect(fromAccountPlan(document).stops[0].fixed).toBe('14:00')
})
it('allows explicitly hiding a deleted import candidate without deleting its local original',async()=>{
 const api=transport(),disk=storage(),p=fixture();disk.setItem(storageKey,JSON.stringify({...freshState(),plans:[p],activeId:p.id}));const a=new OutingsAccountStore(api,disk);a.bind('member:7');await ready(a);await vi.waitFor(()=>expect(a.read().imports).toHaveLength(1));const key=a.read().imports[0].key
 await a.importOne(key);await a.remove(key);await vi.waitFor(()=>expect(a.read().imports).toHaveLength(1));a.hideImport(key);expect(a.read().imports).toEqual([]);expect(JSON.parse(disk.getItem(storageKey)!).plans).toHaveLength(1)
 a.bind('');const b=new OutingsAccountStore(api,disk);b.bind('member:7');await ready(b);await vi.waitFor(()=>expect(b.read().imports).toEqual([]));expect(api.save).toHaveBeenCalledTimes(1)
})
