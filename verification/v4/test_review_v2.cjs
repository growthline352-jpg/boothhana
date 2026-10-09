/* Executes actual TS modules with a deterministic hook harness and mocked network.
 * Not a React DOM, browser, real Spring or R2 integration test. */
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), cp = require('node:child_process')
const ts = require('./load_ts.cjs')()
const ROOT=path.resolve(__dirname,'../../frontend/src')
function load(relative, inject={}) {
 const text=fs.readFileSync(path.join(ROOT,relative),'utf8')
 const js=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const module={exports:{}}
 const requireLocal=name=>name in inject?inject[name]:load(path.posix.join(path.posix.dirname(relative),name)+'.ts',inject)
 vm.runInNewContext(js,{module,exports:module.exports,require:requireLocal,console,setTimeout,clearTimeout,
   crypto:global.crypto,AbortController,URL,URLSearchParams,File,Blob,Error,Promise,Uint8Array,Array,Set,Number},{filename:relative})
 return module.exports
}
const tests=[];const test=(name,run)=>tests.push([name,run]);const tick=()=>new Promise(resolve=>setImmediate(resolve))
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {resolve,reject,promise}}
function harness(){
 let slots=[],cursor=0,effects=[],layout=[]
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]))
 const react={
   useState(initial){const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return [slots[i].value,next=>{slots[i].value=typeof next==='function'?next(slots[i].value):next}]},
   useRef(initial){const i=cursor++;return slots[i]??(slots[i]={current:initial})},
   useMemo(make,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={deps,value:make()};return slots[i].value},
   useCallback(fn,deps){return react.useMemo(()=>fn,deps)},
   useEffect(fn,deps){record(fn,deps,effects)},useLayoutEffect(fn,deps){record(fn,deps,layout)},
   useSyncExternalStore(subscribe,read){react.useEffect(()=>subscribe(()=>{}),[subscribe]);return read()},
 }
 function record(fn,deps,queue){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps)){queue.push(()=>{slots[i]?.cleanup?.();slots[i]={deps,cleanup:fn()}})}}
 const {useRemote}=load('app/useRemote.ts',{react})
 return {render(loadData,deps){cursor=0;effects=[];layout=[];const result=useRemote('verification:v4:remote',loadData,deps);layout.forEach(f=>f());effects.forEach(f=>f());return result},unmount(){slots.forEach(s=>s?.cleanup?.())}}
}
test('old reload cannot start a request after A -> B',async()=>{
 const h=harness();let a=0,b=0;const getA=async()=>{a++;return 'A'},getB=async()=>{b++;return 'B'}
 const old=h.render(getA,['A']);await tick();h.render(getB,['B']);await tick();
 await old.reload();assert.equal(a,1);assert.equal(b,1);assert.equal(h.render(getB,['B']).data,'B');h.unmount()
})
test('late A response cannot replace B',async()=>{
 const h=harness(),a=deferred();const getB=async()=>'B';h.render(()=>a.promise,['A']);h.render(getB,['B']);await tick();a.resolve('A');await tick();assert.equal(h.render(getB,['B']).data,'B');h.unmount()
})
test('A -> B -> A does not reactivate the original A closure',async()=>{
 const h=harness();let calls=0;const a=async()=>++calls,b=async()=>'B';const first=h.render(a,['A']);await tick();h.render(b,['B']);await tick();const returned=h.render(a,['A']);assert.equal(returned.data,1);assert.equal(returned.loading,false);await tick();await first.reload();assert.equal(calls,1);h.unmount()
})
test('old setData is scoped and cannot overwrite a new lookup',async()=>{
 const h=harness();const a=h.render(async()=>'A',['A']);await tick();const b=async()=>'B';h.render(b,['B']);await tick();a.setData('wrong');assert.equal(h.render(b,['B']).data,'B');h.unmount()
})
test('unmounted reload performs no network work',async()=>{
 const h=harness();let n=0;const a=h.render(async()=>++n,[]);await tick();h.unmount();await a.reload();assert.equal(n,1)
})
test('render hides old data immediately before replacement load completes',async()=>{
 const h=harness();h.render(async()=>'A',['A']);await tick();const d=deferred();const b=h.render(()=>d.promise,['B']);assert.equal(b.data,null);assert.equal(b.loading,true);d.resolve('B');await tick();h.unmount()
})
test('same-scope slower reload cannot overwrite a newer reload',async()=>{
 const h=harness(),a=deferred(),b=deferred();let n=0;const loader=()=>++n===1?a.promise:b.promise;const first=h.render(loader,[]);const next=first.reload();b.resolve('new');await next;a.resolve('old');await tick();assert.equal(h.render(loader,[]).data,'new');h.unmount()
})
test('same-tick save is admitted only once and released after completion',async()=>{
 const {SingleFlight}=load('app/SingleFlight.ts');const guard=new SingleFlight();assert.equal(guard.begin(),true);assert.equal(guard.begin(),false);guard.finish();assert.equal(guard.begin(),true)
})
class ApiError extends Error {}
function taskModule(api){return load('api/image-upload.ts',{'./client':{api,ApiError}})}
function png(){return new File([new Uint8Array([137,80,78,71,13,10,26,10])],'test.png',{type:'image/png'})}
test('complete response loss retries the SAME ID and does not upload again',async()=>{
 let state='REGISTERED',uploads=0,completes=0;const ids=[]
 const {createImageUploadTask}=taskModule(async(url,init)=>{
  if(url.endsWith('/tickets')){const input=JSON.parse(init.body);ids.push(input.uploadId);assert.match(input.sha256,/^[0-9a-f]{64}$/);return {uploadId:input.uploadId,state}}
  if(url.endsWith('/content')){uploads++;assert.equal(init.body.size,8);state='STORED';return}
  completes++;state='COMPLETE';if(completes===1)throw new Error('lost response');return {objectKey:'verified/product/42/result.png'}
 })
 const task=createImageUploadTask(png(),'product');await assert.rejects(task.run(),/lost response/);assert.equal(await task.run(),'verified/product/42/result.png');assert.equal(ids[0],ids[1]);assert.equal(uploads,1);assert.equal(completes,2)
})
test('registration response loss reuses its ID on explicit retry',async()=>{
 const ids=[];let first=true;const {createImageUploadTask}=taskModule(async(url,init)=>{
  if(url.endsWith('/tickets')){ids.push(JSON.parse(init.body).uploadId);if(first){first=false;throw new Error('lost')};return {state:'REGISTERED'}}
  if(url.endsWith('/complete'))return {objectKey:'saved'}
 });const task=createImageUploadTask(png(),'booth');await assert.rejects(task.run());assert.equal(await task.run(),'saved');assert.equal(ids.length,2);assert.equal(ids[0],ids[1])
})
test('concurrent runs of the same upload task are rejected',async()=>{
 const d=deferred();const {createImageUploadTask}=taskModule(async url=>url.endsWith('/tickets')?d.promise:{objectKey:'saved'})
 const task=createImageUploadTask(png(),'product'),first=task.run();await assert.rejects(task.run(),/이미 진행/);d.resolve({state:'COMPLETE'});await first
})
test('aborted upload starts no request',async()=>{
 let calls=0;const {createImageUploadTask}=taskModule(async()=>{calls++});const controller=new AbortController();controller.abort();await assert.rejects(createImageUploadTask(png(),'product').run(controller.signal),/취소/);assert.equal(calls,0)
})
test('front-end rejects oversized and invalid-type selections',async()=>{
 const {createImageUploadTask}=taskModule(async()=>{});assert.throws(()=>createImageUploadTask(new File(['x'],'x.svg',{type:'image/svg+xml'}),'product'))
 assert.throws(()=>createImageUploadTask(new File([new Uint8Array(10485761)],'x.png',{type:'image/png'}),'product'))
})
;(async()=>{let n=0;for(const [name,run]of tests){await run();console.log('PASS:',name);n++}console.log(`${n} V2 behavior tests passed. Hook harness + mocked API, NOT browser/React DOM/Spring/R2 integration.`)})().catch(e=>{console.error(e);process.exitCode=1})
