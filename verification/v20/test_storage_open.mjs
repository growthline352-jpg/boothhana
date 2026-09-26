/** Exact offline store; IDB open events are simulated to cover failed-upgrade ordering. */
import test from 'node:test'
import assert from 'node:assert/strict'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
const root=process.env.BOOTHHANA_REVIEW_BASELINE||resolve(import.meta.dirname,'../..')
const store=await import(pathToFileURL(resolve(root,'frontend/public/offline/store.mjs')))
function set(t,name,value){const d=Object.getOwnPropertyDescriptor(globalThis,name);Object.defineProperty(globalThis,name,{value,configurable:true,writable:true});t.after(()=>d?Object.defineProperty(globalThis,name,d):delete globalThis[name])}
for(const reason of ['blocked','timeout'])test(`an IDB open rejected as ${reason} must abort a later upgrade without clearing offline copies`,async t=>{
 let request,clears=0,aborts=0,closed=0,timer
 set(t,'indexedDB',{open(){request={};return request}})
 if(reason==='timeout'){set(t,'setTimeout',fn=>{timer=fn;return 1});set(t,'clearTimeout',()=>{})}
 const p=store.currentOwner().catch(e=>e)
 assert.ok(request)
 if(reason==='blocked')request.onblocked();else timer()
 assert.ok(await p instanceof Error)
 request.result={objectStoreNames:{contains:()=>true},close(){closed++}}
 request.transaction={objectStore(){return {clear(){clears++}}},abort(){aborts++}}
 request.onupgradeneeded({oldVersion:1,newVersion:2})
 assert.equal(clears,0,'a failed open must not clear the old store later');assert.equal(aborts,1)
 request.onsuccess();assert.equal(closed,1)
})
