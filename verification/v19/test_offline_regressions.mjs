import test from 'node:test'
import assert from 'node:assert/strict'
import {pathToFileURL} from 'node:url'
import {resolve} from 'node:path'
import {memoryIDB,deferred} from './support/memory-idb.mjs'
const root=process.env.BOOTHHANA_REVIEW_BASELINE||resolve(import.meta.dirname,'../..')
const policy=await import(pathToFileURL(resolve(root,'frontend/public/offline/policy.mjs')))
const store=await import(pathToFileURL(resolve(root,'frontend/public/offline/store.mjs')))
function setup(t){
 const saved=new Map();const set=(k,v)=>{saved.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value:v,configurable:true,writable:true})}
 const idb=memoryIDB(),worker={state:'activated',postMessage(_m,ports){ports[0].postMessage({ready:true,version:policy.VERSION});ports[0].close()}}
 set('indexedDB',idb);set('isSecureContext',true);set('navigator',{serviceWorker:{async register(){return {active:worker,async update(){}}}}})
 set('BroadcastChannel',class {postMessage(){}close(){}});set('createImageBitmap',async()=>({close(){}}))
 const state={raw:{id:1,publishedAt:'original',event:{region:'GYEONGGI',name:'original',subcategory:'DESIGN'},participants:[{id:10,participant:{registrationName:'booth'},sales:{summary:'withdrawn-summary'},productRows:[{id:20,data:{name:'product'}}]}]},plans:{plans:[],managedAssetIds:[]},beforeEvent:null,requests:0}
 set('fetch',async url=>{
  if(String(url).endsWith('/floorplans'))return new Response(JSON.stringify(state.plans),{headers:{'Content-Type':'application/json'}})
  if(String(url).includes('/api/public/catalog/events/')){state.requests++;const value=structuredClone(state.raw);if(state.beforeEvent)await state.beforeEvent();return new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}})}
  return new Response('test-image-bytes',{headers:{'Content-Type':'image/png'}})
 })
 t.after(()=>{for(const [k,d]of saved)d?Object.defineProperty(globalThis,k,d):delete globalThis[k]})
 return {idb,state,save:async(owner='guest',selection=[])=>{await store.syncOwner(owner);return store.downloadEvent({apiBase:'https://api.example.test',eventId:1,owner,selection})}}
}
test('withdrawn sales summary and product text disappear after successful public check',async t=>{
 const {state,save}=setup(t);await save();const old=await store.getPack(1)
 state.raw.participants[0].sales=null;state.raw.participants[0].productRows=[]
 await store.revalidate(old);const current=await store.getPack(1)
 assert.equal(current.participants[0].summary,'');assert.equal(current.participants[0].products.length,0)
})
test('updated attribution is used for retained permitted image without silently redownloading',async t=>{
 const {state,save}=setup(t);state.raw.assets=[{id:30,type:'PRODUCT',participantId:10,productId:20,url:'https://image.example.test/a.png',credit:'old-credit',offlineAllowed:true}]
 await save('guest',[{type:'PRODUCT',id:20}]);state.raw.assets[0].credit='corrected-credit';await store.revalidate(await store.getPack(1))
 const current=await store.getPack(1);assert.equal(current.media[0].credit,'corrected-credit');assert.equal(current.blobs.length,1)
})
test('explicit per-event deletion cancels an in-flight refresh (no resurrection)',async t=>{
 const {state,save}=setup(t);await save();const started=deferred(),release=deferred()
 state.beforeEvent=async()=>{started.resolve();await release.promise}
 const pending=save().then(()=>null,e=>e);await started.promise;await store.deletePack(1);release.resolve()
 assert.ok(await pending instanceof Error);assert.equal(await store.getPack(1),null)
})
test('first-time in-flight download is canceled even when deleted before a package exists',async t=>{
 const {state,save}=setup(t);const started=deferred(),release=deferred()
 state.beforeEvent=async()=>{started.resolve();await release.promise}
 const pending=save().then(()=>null,e=>e);await started.promise;await store.deletePack(1);release.resolve()
 assert.ok(await pending instanceof Error);assert.equal(await store.getPack(1),null)
})
test('slower prior download cannot overwrite a newly committed refresh',async t=>{
 const {state,save}=setup(t);await save();const started=deferred(),release=deferred()
 state.raw.event.name='stale';state.beforeEvent=async()=>{started.resolve();await release.promise}
 const first=save().then(()=>null,e=>e);await started.promise
 state.beforeEvent=null;state.raw.event.name='newer';await save();release.resolve()
 assert.ok(await first instanceof Error);assert.equal((await store.getPack(1)).name,'newer')
})
test('late auth synchronization cannot clear a different account after auth changed',async t=>{
 const {idb,save}=setup(t);await save();const release=deferred();idb.delayNextOpen=release.promise;let active=true
 const old=store.syncOwner('member:1',()=>active).then(()=>null,e=>e)
 active=false;await save('member:2');release.resolve()
 assert.ok(await old instanceof Error);assert.equal((await store.currentOwner()).owner,'member:2');assert.ok(await store.getPack(1))
})
test('stale account copy cannot revalidate into new account with identical millisecond timestamp',async t=>{
 const {state,save}=setup(t);const oldNow=Date.now;Date.now=()=>1800000000000;t.after(()=>Date.now=oldNow)
 await save('member:1',[{type:'PRODUCT',id:20}]);const a=await store.getPack(1)
 await save('member:2',[]);const b=await store.getPack(1);const requests=state.requests
 await store.revalidate(a);const current=await store.getPack(1)
 assert.equal(current.copyId,b.copyId);assert.equal(current.participants[0].products[0].selected,false);assert.equal(state.requests,requests)
})
test('late public 404 cannot delete a newer copy with the same savedAt',async t=>{
 const {save}=setup(t);const oldNow=Date.now;Date.now=()=>1800000000000;t.after(()=>Date.now=oldNow)
 await save();const a=await store.getPack(1),original=globalThis.fetch,started=deferred(),release=deferred();let waiting=true
 globalThis.fetch=async(...args)=>{if(waiting&&String(args[0]).endsWith('/events/1')){waiting=false;started.resolve();await release.promise;return new Response('',{status:404})}return original(...args)}
 const old=store.revalidate(a);await started.promise;await save();const b=await store.getPack(1);release.resolve();await old
 assert.ok(await store.getPack(1));assert.equal((await store.getPack(1)).copyId,b.copyId)
})
test('failed permitted plan image is reported as no saved plan, not a successful map download',async t=>{
 const {state,save}=setup(t);state.plans={managedAssetIds:[40],plans:[{id:'p1',assetId:40,state:'READY',offlineAllowed:true,imageUrl:'https://image.example.test/map.png'}]}
 globalThis.createImageBitmap=async()=>{throw Error('decode failed')}
 const result=await save();assert.equal(result.noApprovedPlan,true);assert.equal(result.missing.length,1)
})
test('revalidation does not mutate the old reader object or extend expiration',async t=>{
 const {state,save}=setup(t);await save();const old=await store.getPack(1),snapshot=JSON.stringify(old)
 state.raw.event.name='current-public';await store.revalidate(old);const next=await store.getPack(1)
 assert.equal(JSON.stringify(old),snapshot);assert.equal(next.expiresAt,old.expiresAt);assert.equal(next.savedAt,old.savedAt);assert.equal(next.name,'current-public')
})
test('whole-cache clear and account change stop pending saves',async t=>{
 const {state,save}=setup(t);await save();const started=deferred(),release=deferred();state.beforeEvent=async()=>{started.resolve();await release.promise}
 const first=save().then(()=>null,e=>e);await started.promise;await store.clearAll();release.resolve();assert.ok(await first instanceof Error);assert.equal(await store.getPack(1),null)
})
test('invalid JSON-like MIME is not accepted as a public API JSON document',async t=>{
 setup(t);globalThis.fetch=async()=>new Response('{}',{headers:{'Content-Type':'text/not-json'}})
 await assert.rejects(()=>store.boundedFetch('https://api.example.test',50))
})
test('removed selected product does not turn its parent into an explicitly selected booth',async t=>{
 const {state,save}=setup(t);await save('guest',[{type:'PRODUCT',id:20}]);state.raw.participants[0].productRows=[]
 await store.revalidate(await store.getPack(1));assert.equal((await store.getPack(1)).participants[0].selected,false)
})
test('package cap explains the actual limit and keeps existing packages',async t=>{
 const {state}=setup(t);await store.syncOwner('guest')
 for(let id=1;id<=5;id++){state.raw.id=id;await store.downloadEvent({apiBase:'https://api.example.test',eventId:id,owner:'guest'})}
 state.raw.id=6;await assert.rejects(()=>store.downloadEvent({apiBase:'https://api.example.test',eventId:6,owner:'guest'}),/5개/)
 assert.equal((await store.listPacks()).length,5)
})
