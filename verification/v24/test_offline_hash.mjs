import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {memoryIDB} from '../v19/support/memory-idb.mjs'
const root=process.env.BOOTHHANA_REVIEW_BASELINE||resolve(import.meta.dirname,'../..')
const store=await import(pathToFileURL(resolve(root,'frontend/public/offline/store.mjs')))
const hash=s=>createHash('sha256').update(s).digest('hex')
function setup(t){
 const saved=new Map(),set=(k,v)=>{saved.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value:v,writable:true,configurable:true})}
 set('indexedDB',memoryIDB());set('isSecureContext',true);set('BroadcastChannel',class{postMessage(){}close(){}})
 const worker={state:'activated',postMessage(_m,ports){ports[0].postMessage({ready:true,version:19});ports[0].close()}}
 set('navigator',{serviceWorker:{async register(){return {active:worker,async update(){}}}}});set('createImageBitmap',async()=>({close(){}}))
 const state={image:'actual image bytes',imageRequests:0,raw:{id:1,event:{region:'GYEONGGI',name:'fixture'},participants:[]},plans:{managedAssetIds:[10],plans:[{id:'plan-1',assetId:10,offlineAllowed:true,state:'READY',imageUrl:'https://images.example.com/map.png',sourceSha256:hash('actual image bytes')}]}}
 set('fetch',async url=>{if(url.endsWith('/floorplans'))return new Response(JSON.stringify(state.plans),{headers:{'Content-Type':'application/json'}});if(url.includes('/api/'))return new Response(JSON.stringify(state.raw),{headers:{'Content-Type':'application/json'}});state.imageRequests++;return new Response(state.image,{headers:{'Content-Type':'image/png'}})})
 t.after(()=>{for(const [k,v]of saved)v?Object.defineProperty(globalThis,k,v):delete globalThis[k]})
 return {state,save:async()=>{await store.syncOwner('guest');return store.downloadEvent({eventId:1,apiBase:'https://api.example.com',owner:'guest'})}}
}
test('managed plan validates and records SHA-256 of downloaded bytes',async t=>{
 const {save,state}=setup(t);await save();const pack=await store.getPack(1);assert.equal(pack.blobs.length,1);assert.equal(pack.blobs[0].sha256,hash(state.image));assert.equal(pack.noApprovedPlan,false)
})
test('valid image bytes with the wrong source hash cannot become a saved plan',async t=>{
 const {save,state}=setup(t);state.plans.plans[0].sourceSha256=hash('other image');const result=await save();const p=await store.getPack(1);assert.equal(p.blobs.length,0);assert.equal(result.noApprovedPlan,true);assert.equal(result.missing.length,1)
})
test('missing managed-map hash fails closed but keeps public text available',async t=>{
 const {save,state}=setup(t);delete state.plans.plans[0].sourceSha256;await save();const p=await store.getPack(1);assert.equal(p.blobs.length,0);assert.equal(p.name,'fixture');assert.equal(p.noApprovedPlan,true)
})
test('same URL does not retain old bytes after public source hash changed',async t=>{
 const {save,state}=setup(t);await save();const old=await store.getPack(1);state.plans.plans[0].sourceSha256=hash('updated');await store.revalidate(old);const p=await store.getPack(1)
 assert.equal(p.blobs.length,0);assert.equal(p.expiresAt,old.expiresAt);assert.equal(p.noApprovedPlan,true);assert.equal(state.imageRequests,1)
})
test('matching source hash permits reusing bytes without extending retention',async t=>{
 const {save,state}=setup(t);await save();const old=await store.getPack(1);state.plans.plans[0].credit='corrected';await store.revalidate(old);const p=await store.getPack(1)
 assert.equal(p.blobs.length,1);assert.equal(p.media[0].credit,'corrected');assert.equal(p.expiresAt,old.expiresAt);assert.equal(state.imageRequests,1)
})
test('unmanaged approved image retains its existing download contract',async t=>{
 const {save,state}=setup(t);state.plans={plans:[],managedAssetIds:[]};state.raw.assets=[{id:11,type:'FLOOR_PLAN',offlineAllowed:true,url:'https://images.example.com/plain.png'}];await save();assert.equal((await store.getPack(1)).blobs.length,1)
})
