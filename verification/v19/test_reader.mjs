/** Execute the actual reader JS with an explicitly minimal DOM/storage/broadcast test double.
 * NOT Chromium, layout, service worker or IndexedDB integration. */
import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {deferred} from './support/memory-idb.mjs'
const root=process.env.BOOTHHANA_REVIEW_BASELINE||resolve(import.meta.dirname,'../..')
const source=await readFile(resolve(root,'frontend/public/offline/app.mjs'),'utf8')
const tick=async()=>{for(let i=0;i<5;i++)await new Promise(setImmediate)}
class Element {
 constructor(tag){this.tag=tag;this.children=[];this.text='';this.style={};this.events={}}
 set textContent(v){this.text=String(v);this.children=[]}get textContent(){return this.text+this.children.map(n=>n?.textContent??String(n)).join(' ')}
 append(...values){this.children.push(...values);for(const v of values)if(v&&typeof v==='object')v.parent=this}
 replaceChildren(...values){this.text='';this.children=[];this.append(...values)}
 querySelector(tag){return this.children.find(c=>c.tag===tag)||this.children.map(c=>c.querySelector?.(tag)).find(Boolean)}
 addEventListener(k,v){this.events[k]=v}setAttribute(){}remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this)}
}
function pack(){return {id:1,name:'event-detail',savedAt:Date.now(),expiresAt:Date.now()+100000,bytes:10,copyId:'one',venue:'venue',address:'address',admission:'free',occurrences:[],operation:{},missing:[],warnings:[],sources:[],selectedDay:'',participants:[{id:10,name:'booth',summary:'old-summary',subjects:[],locations:[],links:[],products:[{id:20,name:'product'}]}],media:[{key:'asset:30',type:'PRODUCT',participantId:10,productId:20,credit:'credit',caption:'image'}],blobs:[{key:'asset:30',blob:new Blob(['image'])}]}}
async function harness({list=async()=>[],value=pack(),hash='#1'}={}){
 const nodes=Object.fromEntries(['content','status','connection','clear','header','h1','.brand','.brand span'].map(id=>[id,new Element('div')])),timers=new Map(),channels=[],revoked=[],created=[];let n=0
 const state={value,list},context={console,Blob,Date,Promise,Number,Map,Set,URLSearchParams,URL:{createObjectURL(){const u='blob:'+created.length;created.push(u);return u},revokeObjectURL:u=>revoked.push(u)},
  document:{querySelector:q=>nodes[q.startsWith('#')?q.slice(1):q],createElement:tag=>new Element(tag),createTextNode:v=>({textContent:v}),addEventListener(){},visibilityState:'visible'},
  window:{addEventListener(){}},location:{hash,search:'',pathname:'/offline/index.html',origin:'https://app.test'},navigator:{onLine:false},confirm:()=>true,
  setTimeout:(fn,ms)=>{timers.set(++n,{fn,ms});return n},clearTimeout:id=>timers.delete(id),
  BroadcastChannel:class{constructor(){channels.push(this)}},safeLink:v=>v||'',
  listPacks:()=>state.list(),getPack:async()=>state.value,deletePack:async()=>{state.value=null},clearAll:async()=>{state.value=null},revalidate:async()=>({state:'unreachable'}),ensureShell:async()=>true}
 vm.createContext(context)
 vm.runInContext(source.replace(/^import .*$/gm,'')+'\nglobalThis.reader={load,renderPack,renderParticipants,blobURL,dispose};',context)
 await tick();return {context,state,nodes,timers,channels,created,revoked}
}
test('a delayed home list cannot overwrite the selected event detail',async()=>{
 const wait=deferred(),h=await harness({hash:'',list:()=>wait.promise});h.context.location.hash='#1';await h.context.reader.load(false)
 wait.resolve([]);await tick();assert.ok(h.nodes.content.textContent.includes('event-detail'));assert.ok(!h.nodes.content.textContent.includes('저장한 행사가 없습니다'))
})
test('repeated search rendering reuses image object URLs instead of leaking new ones',async()=>{
 const h=await harness();for(let i=0;i<30;i++)h.context.reader.renderParticipants(h.state.value,new Element('div'))
 assert.equal(h.created.length,1);h.context.reader.dispose();assert.equal(h.revoked.length,1)
})
test('another tab revoking a permitted image removes the already displayed copy',async()=>{
 const h=await harness();h.state.value={...h.state.value,copyId:'two',blobs:[],media:[],participants:[]};h.channels[0].onmessage();await tick()
 assert.ok(!h.nodes.content.textContent.includes('old-summary'));assert.equal(h.revoked.length,1)
})
test('an open event expires without requiring manual navigation or reload',async()=>{
 const h=await harness();const expiry=[...h.timers.values()].find(x=>x.ms>=0&&x.ms<=100010);assert.ok(expiry,'expiration timer required')
 h.state.value=null;expiry.fn();await tick();assert.ok(!h.nodes.content.textContent.includes('event-detail'));assert.ok(h.nodes.content.textContent.includes('만료'))
})
