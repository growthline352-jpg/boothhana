import {describe,it,expect,vi} from 'vitest'
import {PersonalPlanStore,importId,type PlanTransport} from './PersonalPlanStore'
import type {Plan} from './model'
const plan=(title='코스'):Plan=>({version:1,id:'da7a3b21-746a-4444-8888-746a44448888',title,purpose:'DATE',day:'2026-10-09',start:'10:00',end:'19:00',area:'SEONGSU',style:'CONTENT',updatedAt:'2026-10-06T01:00:00Z',stops:[{id:'one',kind:'PLACE',name:'장소',address:'서울',point:null,start:'11:00',duration:60,locked:false,note:'개인 메모',url:'',source:'MANUAL'}]})
const record=(p=plan(),revision=1)=>({plan:p,revision,updatedAt:p.updatedAt})
function setup(transport:Partial<PlanTransport>={},storage=new Map<string,string>()){const api={list:vi.fn(async()=>[record()]),save:vi.fn(async(p:Plan,r:number)=>record(p,r+1)),remove:vi.fn(async()=>{}),...transport};const store=new PersonalPlanStore(api,{getItem:k=>storage.get(k)||null,setItem:(k,v)=>{storage.set(k,v)}});return {api,store,storage}}
async function ready(store:PersonalPlanStore,owner='member:1'){store.bind(owner);await vi.waitFor(()=>expect(store.read().status).toBe('ready'))}
const guestKey='boothhana.itineraries.v1:guest',attemptKey='boothhana.itinerary-imports.v1:member:1'
function tombstoneApi(){
 const active=new Map<string,ReturnType<typeof record>>(),deleted=new Set<string>()
 const api:PlanTransport={list:async()=>[...active.values()],save:vi.fn(async(p:Plan,revision:number)=>{if(deleted.has(p.id))throw Object.assign(new Error('삭제된 일정이에요.'),{status:404});const previous=active.get(p.id);if(previous&&revision===0&&JSON.stringify(previous.plan)===JSON.stringify(p))return previous;if(previous&&revision!==previous.revision)throw Object.assign(new Error('버전 충돌'),{status:409});const value=record(p,revision+1);active.set(p.id,value);return value}),remove:async(id)=>{active.delete(id);deleted.add(id)}}
 return {api,active,deleted}
}
describe('private plan storage',()=>{
 it('offers guest schedules for explicit account import without uploading automatically',async()=>{const storage=new Map([['boothhana.itineraries.v1:guest',JSON.stringify([plan('비회원 일정')])]]);const {api,store}=setup({list:async()=>[]},storage);await ready(store);expect(store.read().local[0].title).toBe('비회원 일정');expect(api.save).not.toHaveBeenCalled();await store.importOne(store.read().local[0]);expect(JSON.parse(storage.get('boothhana.itineraries.v1:guest')!)).toHaveLength(0)})
 it('keeps guest schedules in the browser and sends no API request',async()=>{const {api,store,storage}=setup();await ready(store,'guest');await store.save(plan(),0);expect(api.list).not.toHaveBeenCalled();expect(api.save).not.toHaveBeenCalled();expect(storage.has('boothhana.itineraries.v1:guest')).toBe(true)})
 it('stores member notes server-side with the captured revision and owner',async()=>{const {api,store}=setup();await ready(store);await store.save(plan('수정'),1);expect(api.save).toHaveBeenCalledWith(plan('수정'),1,1);expect(store.read().records[0].revision).toBe(2)})
 it('ignores an old account list that arrives after switching accounts',async()=>{let finish!:(value:ReturnType<typeof record>[])=>void;const slow=new Promise<ReturnType<typeof record>[]>(r=>{finish=r});const {store}=setup({list:vi.fn().mockReturnValueOnce(slow).mockResolvedValue([record(plan('다른 계정'))])});store.bind('member:1');await ready(store,'member:2');finish([record(plan('이전 계정'))]);await Promise.resolve();expect(store.read().records[0].plan.title).toBe('다른 계정')})
 it('does not display a completed save in the new account',async()=>{let finish!:(value:ReturnType<typeof record>)=>void;const slow=new Promise<ReturnType<typeof record>>(r=>{finish=r});const {store}=setup({save:()=>slow});await ready(store);const saving=store.save(plan('이전 작업'),1);store.bind('guest');finish(record(plan('이전 작업'),2));await expect(saving).rejects.toThrow('계정이 바뀌');expect(store.read().records.some(r=>r.plan.title==='이전 작업')).toBe(false)})
 it('preserves records after a save conflict and does not report success',async()=>{const {store}=setup({save:async()=>{throw new Error('다른 기기에서 수정')}});await ready(store);await expect(store.save(plan('초안'),1)).rejects.toThrow('다른 기기');expect(store.read().records[0].plan.title).toBe('코스');expect(store.read().busy).toBe(false)})
 it('requires explicit import and leaves originals if server import fails',async()=>{const storage=new Map([['boothhana.itineraries.v1:member:1',JSON.stringify([plan('옛 일정')])]]);const {api,store}=setup({list:async()=>[],save:vi.fn(async()=>{throw new Error('연결 실패')})},storage);await ready(store);expect(api.save).not.toHaveBeenCalled();expect(store.read().local).toHaveLength(1);await expect(store.importOne(store.read().local[0])).rejects.toThrow('연결 실패');expect(JSON.parse(storage.get('boothhana.itineraries.v1:member:1')!)).toHaveLength(1)})
 it('uses a stable import ID so cleanup failures cannot cause duplicate imports',async()=>{const p=plan();expect(await importId('member:1',p)).toBe(await importId('member:1',p));expect(await importId('member:1',p)).not.toBe(await importId('member:2',p));const imported={...p,id:await importId('member:1',p)},storage=new Map([['boothhana.itineraries.v1:member:1',JSON.stringify([p])]]),{store}=setup({list:async()=>[record(imported)]},storage);await ready(store);expect(store.read().local).toHaveLength(0)})
 it('recovers an imported original after a lost response and remote deletion using an explicit new copy',async()=>{
  const p=plan('응답 유실 후 삭제'),storage=new Map([[guestKey,JSON.stringify([p])]]),{api,active,deleted}=tombstoneApi(),write=api.save
  let loseResponse=true
  const {store}=setup({...api,save:async(...args)=>{const value=await write(...args);if(loseResponse){loseResponse=false;throw new Error('응답 유실')}return value}},storage)
  await ready(store);await expect(store.importOne(p)).rejects.toThrow('응답 유실')
  await store.refresh();expect(store.read().local).toHaveLength(0);expect(JSON.parse(storage.get(guestKey)!)).toHaveLength(1)
  const oldId=[...active.keys()][0];await store.remove(oldId);await store.refresh();expect(store.read().local).toHaveLength(1)
  await expect(store.importOne(p)).rejects.toMatchObject({status:404})
  const imported=await store.importOne(p,true)
  expect(imported.plan.id).not.toBe(oldId);expect(deleted.has(oldId)).toBe(true);expect(active.size).toBe(1);expect(store.read().local).toHaveLength(0);expect(JSON.parse(storage.get(guestKey)!)).toHaveLength(0)
 })
 it('reuses a new copy ID after an ambiguous response and a page reload',async()=>{
  const p=plan(),storage=new Map([[guestKey,JSON.stringify([p])]]),{api,active}=tombstoneApi(),write=api.save
  const {store}=setup({...api,save:async(...args)=>{await write(...args);throw new Error('응답 유실')}},storage)
  await ready(store);await expect(store.importOne(p,true)).rejects.toThrow('응답 유실')
  const importedId=[...active.keys()][0]
  expect(JSON.parse(storage.get(attemptKey)!)[await importId('member:1',p)]).toBe(importedId)
  const {store:reloaded}=setup(api,storage);await ready(reloaded);expect(reloaded.read().local).toHaveLength(0)
  const retried=await reloaded.importOne(p);expect(retried.plan.id).toBe(importedId);expect(active.size).toBe(1);expect(api.save).toHaveBeenLastCalledWith({...p,id:importedId},0,1)
 })
 it('deduplicates a new copy when browser cleanup fails after a confirmed save',async()=>{
  const p=plan(),storage=new Map([[guestKey,JSON.stringify([p])]]),{api,active}=tombstoneApi()
  const store=new PersonalPlanStore(api,{getItem:k=>storage.get(k)||null,setItem:(k,v)=>{if(k!==attemptKey)throw new Error('정리 실패');storage.set(k,v)}})
  await ready(store);const imported=await store.importOne(p,true);expect(active.has(imported.plan.id)).toBe(true);expect(storage.has(attemptKey)).toBe(true);expect(JSON.parse(storage.get(guestKey)!)).toHaveLength(1)
  await store.refresh();expect(store.read().local).toHaveLength(0)
 })
 it('does not send a new copy when its retry identity cannot be stored',async()=>{
  const p=plan(),storage=new Map([[guestKey,JSON.stringify([p])]]),{api}=tombstoneApi()
  const store=new PersonalPlanStore(api,{getItem:k=>storage.get(k)||null,setItem:()=>{throw new Error('저장 공간 부족')}})
  await ready(store);await expect(store.importOne(p,true)).rejects.toThrow('아직 계정에 전송하지 않았어요');expect(api.save).not.toHaveBeenCalled();expect(store.read().local).toHaveLength(1);expect(store.read().busy).toBe(false)
 })
 it('does not fall back to a different ID when a persisted new copy identity cannot be read',async()=>{
  const p=plan(),storage=new Map([[guestKey,JSON.stringify([p])],[attemptKey,JSON.stringify({[await importId('member:1',p)]:'11aa22bb-3333-4444-8888-aabbccddeeff'})]]),{api}=tombstoneApi()
  const store=new PersonalPlanStore(api,{getItem:k=>{if(k===attemptKey)throw new Error('기기 조회 실패');return storage.get(k)||null},setItem:(k,v)=>{storage.set(k,v)}})
  await ready(store);await expect(store.importOne(p)).rejects.toThrow('재시도 정보를 확인하지 못했어요');expect(api.save).not.toHaveBeenCalled();expect(store.read().local).toHaveLength(1);expect(store.read().busy).toBe(false)
 })
 it('reserves the import before asynchronous hashing so duplicate clicks cannot replace the retry ID',async()=>{
  const p=plan(),storage=new Map([[guestKey,JSON.stringify([p])]]);let finish!:(value:ReturnType<typeof record>)=>void
  const save=vi.fn((_p:Plan,_revision:number,_owner:number)=>new Promise<ReturnType<typeof record>>(resolve=>{finish=resolve})),{store}=setup({list:async()=>[],save},storage)
  await ready(store);const first=store.importOne(p,true);await expect(store.importOne(p,true)).rejects.toThrow('먼저 확인')
  await vi.waitFor(()=>expect(save).toHaveBeenCalledTimes(1));const sent=save.mock.calls[0][0]
  expect(JSON.parse(storage.get(attemptKey)!)[await importId('member:1',p)]).toBe(sent.id)
  finish(record(sent));await first;expect(save).toHaveBeenCalledTimes(1)
 })
 it('continues bulk import after a deleted item and keeps that original available for recovery',async()=>{
  const p=plan('삭제된 항목'),other=plan('가져올 다른 항목'),storage=new Map([[guestKey,JSON.stringify([p,other])]]),{api,active,deleted}=tombstoneApi()
  deleted.add(await importId('member:1',p));const {store}=setup(api,storage);await ready(store)
  const outcomes=await store.importAll();expect(outcomes).toHaveLength(2);expect(outcomes[0].error).toMatchObject({status:404});expect(outcomes[1].error).toBeNull();expect(active.size).toBe(1);expect(store.read().local).toEqual([p]);expect(JSON.parse(storage.get(guestKey)!)).toEqual([p])
 })
 it('stops bulk import on account change and leaves old originals untouched',async()=>{
  const p=plan('첫 일정'),other=plan('두 번째 일정'),storage=new Map([[guestKey,JSON.stringify([p,other])]]);let finish!:(value:ReturnType<typeof record>)=>void
  const save=vi.fn((_p:Plan,_revision:number,_owner:number)=>new Promise<ReturnType<typeof record>>(resolve=>{finish=resolve})),{store}=setup({list:async()=>[],save},storage)
  await ready(store);const importing=store.importAll(),rejected=expect(importing).rejects.toThrow('계정이 바뀌')
  await vi.waitFor(()=>expect(save).toHaveBeenCalledTimes(1));await ready(store,'member:2');finish(record(save.mock.calls[0][0]));await rejected
  expect(save).toHaveBeenCalledTimes(1);expect(save.mock.calls[0][2]).toBe(1);expect(store.read().records).toHaveLength(0);expect(JSON.parse(storage.get(guestKey)!)).toEqual([p,other])
 })
 it('discards only the selected local original without deleting a server record or another account data',async()=>{
  const p=plan('제외할 원본'),other=plan('남길 원본'),otherKey='boothhana.itineraries.v1:member:2',storage=new Map([[guestKey,JSON.stringify([p,other])],['boothhana.itineraries.v1:member:1',JSON.stringify([p])],[otherKey,JSON.stringify([p])]]),{api,store}=setup({},storage)
  await ready(store);await store.discardLocal(structuredClone(p));expect(store.read().local).toEqual([other]);expect(JSON.parse(storage.get(guestKey)!)).toEqual([other]);expect(JSON.parse(storage.get('boothhana.itineraries.v1:member:1')!)).toEqual([]);expect(JSON.parse(storage.get(otherKey)!)).toEqual([p]);expect(store.read().records).toHaveLength(1);expect(api.remove).not.toHaveBeenCalled();expect(api.save).not.toHaveBeenCalled()
 })
})
