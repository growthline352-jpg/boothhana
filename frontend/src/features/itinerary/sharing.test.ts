import {describe,it,expect,vi} from 'vitest'
import {copySharedPlan,createShareInput,publicSnapshot,readManagedShares,safeShareUrl,saveSharedCopy,sharedCopyStorageKey,shareSignature,shareStorageKey} from './sharing'
import {validatePlan,type Plan} from './model'
const plan:Plan={version:1,id:'a',title:'함께 가는 은혼 카페',purpose:'EVENT',day:'2026-10-09',start:'12:00',end:'18:00',area:'HONGDAE',style:'FAN',interests:{topics:['ANIME_MANGA'],subjects:['은혼']},updatedAt:'2026-10-05T01:00:00Z',stops:[{id:'b',kind:'EVENT',name:'긴토키 카페',address:'서울 마포구',point:{lat:37.55,lng:126.92},eventId:239,start:'13:00',duration:60,locked:true,note:'내 예약번호 12345',url:'/discover/239?day=2026-10-09',source:'CATALOG'}]}
describe('itinerary snapshot sharing privacy',()=>{
 it('whitelists nested coordinates and occurrence fields before upload',()=>{const nested={...plan,stops:[{...plan.stops[0],point:{lat:37.55,lng:126.92,privateEmail:'private@example.test'},occurrences:[{startDate:'2026-10-09',endDate:'2026-10-09',startTime:null,endTime:null,privateToken:'hidden'}]}]} as unknown as Plan;const snapshot=publicSnapshot(nested);expect(JSON.stringify(snapshot)).not.toContain('privateEmail');expect(JSON.stringify(snapshot)).not.toContain('privateToken');expect(validatePlan(snapshot)).toBe(true)})
 it('omits private notes and unknown fields by default',()=>{const snapshot=publicSnapshot({...plan,accountEmail:'private@example.test'} as Plan);expect(snapshot.stops[0].note).toBe('');expect(JSON.stringify(snapshot)).not.toContain('accountEmail');expect(validatePlan(snapshot)).toBe(true);expect(publicSnapshot(plan,true).stops[0].note).toBe('내 예약번호 12345')})
 it('does not expose management keys in view links or snapshots',()=>{const input=createShareInput(plan,false);expect(input.managementKey).toMatch(/^[\w-]{43}$/);expect(input.requestId).toMatch(/^[\da-f-]{36}$/);expect(JSON.stringify(input.plan)).not.toContain(input.managementKey);expect(shareStorageKey('guest')).not.toBe(shareStorageKey('member:1'))})
 it('drops executable, protocol-relative, credentialed and malformed links',()=>{for(const url of ['javascript:alert(1)','//evil.test/','https://me:secret@example.test','/account','https://example.test\\@evil.test'])expect(safeShareUrl(url)).toBe('');expect(safeShareUrl('https://example.test/info')).toBe('https://example.test/info');expect(safeShareUrl('/discover/239')).toBe('/discover/239')})
 it('clones a valid independently editable itinerary with fresh identities',()=>{const clone=copySharedPlan(publicSnapshot(plan));expect(validatePlan(clone)).toBe(true);expect(clone.id).not.toBe(plan.id);expect(clone.stops[0].id).not.toBe(plan.stops[0].id);expect(clone.interests).toEqual(plan.interests);expect(clone.stops[0].note).toBe('');clone.stops[0].name='새 이름';expect(plan.stops[0].name).toBe('긴토키 카페')})
 it('detects shared content changes while ignoring save timestamps and excluded notes',()=>{expect(shareSignature(plan,false)).toBe(shareSignature({...plan,updatedAt:'2026-10-05T02:00:00Z',stops:[{...plan.stops[0],note:'변경'}]},false));expect(shareSignature(plan,true)).not.toBe(shareSignature({...plan,stops:[{...plan.stops[0],note:'변경'}]},true))})
 it('preserves pending management handles for retry and discards corrupt browser data',()=>{const entry={input:createShareInput(plan,false)};expect(readManagedShares({getItem:()=>JSON.stringify([entry,null,{input:{}}])},'x')).toEqual([entry]);expect(readManagedShares({getItem:()=>'{bad'},'x')).toEqual([])})
})

function copyFixture(){
 const rows=new Map<string,string>(),records=new Map<string,Plan>();
 const storage={getItem:(key:string)=>rows.get(key)||null,setItem:(key:string,value:string)=>{rows.set(key,value)},removeItem:(key:string)=>{rows.delete(key)}};
 const save=vi.fn(async(p:Plan,_revision:number,_owner:number)=>{records.set(p.id,p);return {plan:p,revision:1,updatedAt:p.updatedAt}});
 return {rows,records,storage,save}
}
describe('shared itinerary copy retry',()=>{
it.each(['before','after'])('keeps a failed tab request when its response is lost %s the other tab confirms',async(order)=>{
  const {storage,rows,records,save}=copyFixture(),tabAStorage=copyFixture().storage,tabB=copyFixture(),tabBStorage=tabB.storage,key=sharedCopyStorageKey('member:7','first-share');let finishA!:(value:Awaited<ReturnType<typeof save>>)=>void,rejectB!:(reason:Error)=>void;
  save.mockImplementationOnce(p=>{records.set(p.id,p);return new Promise(resolve=>{finishA=resolve})}).mockImplementationOnce(p=>{records.set(p.id,p);return new Promise((_resolve,reject)=>{rejectB=reject})});
  const first=saveSharedCopy(storage,'member:7','first-share',plan,save,()=>true,false,tabAStorage),other=saveSharedCopy(storage,'member:7','first-share',structuredClone(plan),save,()=>true,false,tabBStorage),lost=expect(other).rejects.toThrow('응답 유실'),posted=save.mock.calls[0][0];
  expect(JSON.stringify(save.mock.calls[1][0])).toBe(JSON.stringify(posted));
  if(order==='before'){rejectB(new Error('응답 유실'));await lost}finishA({plan:posted,revision:1,updatedAt:posted.updatedAt});await first;
  if(order==='after'){rejectB(new Error('응답 유실'));await lost}
  expect(JSON.parse(rows.get(key)!).plan.id).toBe(posted.id);expect(JSON.parse(tabB.rows.get(key)!).confirmed).not.toBe(true);
  const freshTab=await saveSharedCopy(storage,'member:7','first-share',plan,save,()=>true,false,copyFixture().storage);expect(freshTab.id).toBe(posted.id);
  const reopened=await saveSharedCopy(storage,'member:7','first-share',plan,save,()=>true,false,{...tabBStorage});expect(reopened.id).toBe(posted.id);expect(records.size).toBe(1);
  for(const call of save.mock.calls.slice(0,4))expect(JSON.stringify(call[0])).toBe(JSON.stringify(posted));
  const intentional=await saveSharedCopy(storage,'member:7','first-share',plan,save,()=>true,false,tabAStorage);expect(intentional.id).not.toBe(posted.id);expect(records.size).toBe(2);
 });
 it('does not replace another intentional new copy while retrying its own failed body',async()=>{
  const {storage,rows,records,save}=copyFixture(),tabAStorage=copyFixture().storage,tabBStorage=copyFixture().storage,key=sharedCopyStorageKey('member:7','first-share');let finishA!:(value:Awaited<ReturnType<typeof save>>)=>void,rejectB!:(reason:Error)=>void,finishNew!:(value:Awaited<ReturnType<typeof save>>)=>void;
  save.mockImplementationOnce(p=>{records.set(p.id,p);return new Promise(resolve=>{finishA=resolve})}).mockImplementationOnce(p=>{records.set(p.id,p);return new Promise((_resolve,reject)=>{rejectB=reject})}).mockImplementationOnce(p=>{records.set(p.id,p);return new Promise(resolve=>{finishNew=resolve})});
  const first=saveSharedCopy(storage,'member:7','first-share',plan,save,()=>true,false,tabAStorage),other=saveSharedCopy(storage,'member:7','first-share',plan,save,()=>true,false,tabBStorage),lost=expect(other).rejects.toThrow('응답 유실'),posted=save.mock.calls[0][0];
  finishA({plan:posted,revision:1,updatedAt:posted.updatedAt});await first;
  const intentional=saveSharedCopy(storage,'member:7','first-share',plan,save,()=>true,false,tabAStorage),newBody=save.mock.calls[2][0];expect(newBody.id).not.toBe(posted.id);
  rejectB(new Error('응답 유실'));await lost;expect(JSON.parse(rows.get(key)!).plan.id).toBe(newBody.id);
  const retried=await saveSharedCopy(storage,'member:7','first-share',plan,save,()=>true,false,tabBStorage);expect(retried.id).toBe(posted.id);expect(JSON.parse(rows.get(key)!).plan.id).toBe(newBody.id);
  finishNew({plan:newBody,revision:1,updatedAt:newBody.updatedAt});await intentional;expect(records.size).toBe(2);expect(rows.has(key)).toBe(false);
 });
 it('restores the shared request when another confirmed caller clears it before the failed response',async()=>{
  const {storage,rows,records,save}=copyFixture(),tabAStorage=copyFixture().storage,tabBStorage=copyFixture().storage,key=sharedCopyStorageKey('member:7','first-share');let finishA!:(value:Awaited<ReturnType<typeof save>>)=>void,rejectB!:(reason:Error)=>void;
  save.mockImplementationOnce(p=>{records.set(p.id,p);return new Promise(resolve=>{finishA=resolve})}).mockImplementationOnce(p=>{records.set(p.id,p);return new Promise((_resolve,reject)=>{rejectB=reject})});
  const first=saveSharedCopy(storage,'member:7','first-share',plan,save,()=>true,false,tabAStorage),other=saveSharedCopy(storage,'member:7','first-share',plan,save,()=>true,false,tabBStorage),lost=expect(other).rejects.toThrow('응답 유실'),posted=save.mock.calls[0][0];
  finishA({plan:posted,revision:1,updatedAt:posted.updatedAt});await first;
  await saveSharedCopy(storage,'member:7','first-share',plan,save,()=>true,false,copyFixture().storage);expect(rows.has(key)).toBe(false);
  rejectB(new Error('응답 유실'));await lost;expect(JSON.parse(rows.get(key)!).plan.id).toBe(posted.id);
  const recovered=await saveSharedCopy(storage,'member:7','first-share',plan,save,()=>true,false,copyFixture().storage);expect(recovered.id).toBe(posted.id);expect(records.size).toBe(1);
  const ownRetry=await saveSharedCopy(storage,'member:7','first-share',plan,save,()=>true,false,tabBStorage);expect(ownRetry.id).toBe(posted.id);expect(records.size).toBe(1);
 });
 it.each(['read','write'])('sends nothing when tab retry storage fails (%s)',async(failure)=>{
  const {storage,save}=copyFixture(),tabStorage=copyFixture().storage,blocked={...tabStorage,[failure==='read'?'getItem':'setItem']:()=>{throw new Error('탭 저장 실패')}};
  await expect(saveSharedCopy(storage,'member:7','first-share',plan,save,()=>true,false,blocked)).rejects.toThrow('아직 계정에 전송하지 않았어요');expect(save).not.toHaveBeenCalled();
 });
 it('keeps tab retry bodies and confirmation isolated after logout, account or source changes',async()=>{
  const {storage,rows,save}=copyFixture(),tab=copyFixture(),key=sharedCopyStorageKey('member:7','first-share');let current=true,finish!:(value:Awaited<ReturnType<typeof save>>)=>void;
  save.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}));
  const old=saveSharedCopy(storage,'member:7','first-share',plan,save,()=>current,false,tab.storage),rejected=expect(old).rejects.toThrow('계정이나 공유 일정이 바뀌');current=false;const pending=save.mock.calls[0][0];finish({plan:pending,revision:1,updatedAt:pending.updatedAt});await rejected;
  expect(JSON.parse(tab.rows.get(key)!).confirmed).not.toBe(true);expect(rows.has(key)).toBe(true);
  const other=await saveSharedCopy(storage,'member:8','first-share',plan,save,()=>true,false,tab.storage);expect(other.id).not.toBe(pending.id);expect(save.mock.calls[1][2]).toBe(8);expect(tab.rows.has(key)).toBe(true);
  const sourceChanged=await saveSharedCopy(storage,'member:7','second-share',{...plan,title:'다른 공유 일정'},save,()=>true,false,tab.storage);expect(sourceChanged.id).not.toBe(pending.id);
  const resumed=await saveSharedCopy(storage,'member:7','first-share',plan,save,()=>true,false,tab.storage);expect(resumed.id).toBe(pending.id);
 });
 it('uses an explicitly chosen new tab copy after a deleted retry and keeps its lost-response body',async()=>{
  const {storage,records,save}=copyFixture(),tabStorage=copyFixture().storage;
  save.mockImplementationOnce(p=>{records.set(p.id,p);return Promise.reject(new Error('첫 응답 유실'))});
  await expect(saveSharedCopy(storage,'member:7','first-share',plan,save,()=>true,false,tabStorage)).rejects.toThrow('첫 응답 유실');const deleted=save.mock.calls[0][0].id;records.delete(deleted);
  save.mockImplementation(p=>{if(p.id===deleted)return Promise.reject(Object.assign(new Error('삭제됨'),{status:404}));records.set(p.id,p);return Promise.resolve({plan:p,revision:1,updatedAt:p.updatedAt})});
  await expect(saveSharedCopy(storage,'member:7','first-share',plan,save,()=>true,false,tabStorage)).rejects.toMatchObject({status:404});
  save.mockImplementationOnce(p=>{records.set(p.id,p);return Promise.reject(new Error('새 사본 응답 유실'))});
  await expect(saveSharedCopy(storage,'member:7','first-share',plan,save,()=>true,true,tabStorage)).rejects.toThrow('새 사본 응답 유실');const fresh=save.mock.calls[2][0];
  const retried=await saveSharedCopy(storage,'member:7','first-share',plan,save,()=>true,false,{...tabStorage});expect(retried.id).toBe(fresh.id);expect(fresh.id).not.toBe(deleted);expect(records.size).toBe(1);
 });
 it('reuses the full copy request after a success response is lost and the page is reopened',async()=>{
  const {storage,rows,records,save}=copyFixture();save.mockImplementationOnce(async(p)=>{records.set(p.id,p);throw new TypeError('성공 응답 유실')});
  await expect(saveSharedCopy(storage,'member:7','first-share',plan,save)).rejects.toThrow('성공 응답 유실');
  const persisted=JSON.parse(rows.get(sharedCopyStorageKey('member:7','first-share'))!);
  const restoredStorage={...storage},copied=await saveSharedCopy(restoredStorage,'member:7','first-share',structuredClone(plan),save);
  expect(JSON.stringify(save.mock.calls[1][0])).toBe(JSON.stringify(save.mock.calls[0][0]));expect(copied.id).toBe(persisted.plan.id);expect(copied.stops[0].id).toBe(persisted.plan.stops[0].id);expect(copied.updatedAt).toBe(persisted.plan.updatedAt);expect(records.size).toBe(1);expect(rows.size).toBe(0);
 })
 it('preserves the original retry request when cleanup fails after confirmed saving',async()=>{
  const {storage,records,save}=copyFixture(),brokenCleanup={...storage,removeItem:()=>{throw new Error('정리 실패')}};
  const first=await saveSharedCopy(brokenCleanup,'member:7','first-share',plan,save),retry=await saveSharedCopy(brokenCleanup,'member:7','first-share',plan,save);
  expect(retry.id).toBe(first.id);expect(records.size).toBe(1);
 })
 it('protects a deleted retry ID and persists an explicitly chosen fresh copy for its own retries',async()=>{
  const {storage,rows,records,save}=copyFixture();save.mockImplementationOnce(async(p)=>{records.set(p.id,p);throw new Error('응답 유실')});
  await expect(saveSharedCopy(storage,'member:7','first-share',plan,save)).rejects.toThrow('응답 유실');const deletedId=save.mock.calls[0][0].id;records.delete(deletedId);
  save.mockImplementation(async(p)=>{if(p.id===deletedId)throw Object.assign(new Error('삭제한 계획'),{status:404});records.set(p.id,p);return {plan:p,revision:1,updatedAt:p.updatedAt}});
  await expect(saveSharedCopy(storage,'member:7','first-share',plan,save)).rejects.toMatchObject({status:404});expect(JSON.parse(rows.get(sharedCopyStorageKey('member:7','first-share'))!).plan.id).toBe(deletedId);
  save.mockImplementationOnce(async(p)=>{records.set(p.id,p);throw new Error('새 사본 응답 유실')});await expect(saveSharedCopy(storage,'member:7','first-share',plan,save,()=>true,true)).rejects.toThrow('새 사본 응답 유실');
  const fresh=JSON.parse(rows.get(sharedCopyStorageKey('member:7','first-share'))!).plan,completed=await saveSharedCopy(storage,'member:7','first-share',plan,save);
  expect(fresh.id).not.toBe(deletedId);expect(completed.id).toBe(fresh.id);expect(records.size).toBe(1);expect(records.has(deletedId)).toBe(false);
 })
 it.each(['read','write'])('sends nothing when the retry request cannot be persisted (%s failure)',async(failure)=>{
  const {storage,save}=copyFixture(),blocked={...storage,[failure==='read'?'getItem':'setItem']:()=>{throw new Error('저장 공간 오류')}};
  await expect(saveSharedCopy(blocked,'member:7','first-share',plan,save)).rejects.toThrow('아직 계정에 전송하지 않았어요');expect(save).not.toHaveBeenCalled();
 })
 it('isolates retry bodies by account and shared source',async()=>{
  const {storage,rows,save}=copyFixture();save.mockRejectedValueOnce(new Error('응답 유실'));
  await expect(saveSharedCopy(storage,'member:7','first-share',plan,save)).rejects.toThrow();const original=save.mock.calls[0][0];
  const otherOwner=await saveSharedCopy(storage,'member:8','first-share',plan,save),otherSource=await saveSharedCopy(storage,'member:7','second-share',{...plan,title:'다른 공유 일정'},save);
  expect(otherOwner.id).not.toBe(original.id);expect(otherSource.id).not.toBe(original.id);expect(otherSource.title).toContain('다른 공유 일정');expect(rows.has(sharedCopyStorageKey('member:7','first-share'))).toBe(true);expect(save.mock.calls.map(call=>call[2])).toEqual([7,8,7]);
 })
 it('does not finish an old copy after its caller scope becomes inactive',async()=>{
  const {storage,rows}=copyFixture();let current=true,finish!:(value:{plan:Plan;revision:number;updatedAt:string})=>void;
  const save=vi.fn((_p:Plan,_revision:number,_owner:number)=>new Promise<{plan:Plan;revision:number;updatedAt:string}>(resolve=>{finish=resolve}));
  const copying=saveSharedCopy(storage,'member:7','first-share',plan,save,()=>current);current=false;const posted=save.mock.calls[0][0];finish({plan:posted,revision:1,updatedAt:posted.updatedAt});
  await expect(copying).rejects.toThrow('계정이나 공유 일정이 바뀌');expect(rows.has(sharedCopyStorageKey('member:7','first-share'))).toBe(true);
 })
 it('keeps the pending body after an invalid success response',async()=>{
  const {storage,rows,save}=copyFixture();save.mockResolvedValueOnce({plan:null,revision:1,updatedAt:plan.updatedAt} as unknown as Awaited<ReturnType<typeof save>>);
  await expect(saveSharedCopy(storage,'member:7','first-share',plan,save)).rejects.toThrow('같은 요청으로 다시 시도');const pending=JSON.parse(rows.get(sharedCopyStorageKey('member:7','first-share'))!).plan;
  const retried=await saveSharedCopy(storage,'member:7','first-share',plan,save);expect(retried.id).toBe(pending.id);
 })
})
