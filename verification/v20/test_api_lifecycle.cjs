/** Actual TS modules, transpiled with the repo's existing TypeScript loader.
 * Explicit fetch/clock doubles; not Spring/OAuth or a browser integration test. */
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const {pathToFileURL} = require('node:url')
const ts = require('../v4/load_ts.cjs')()
const root = process.env.BOOTHHANA_REVIEW_BASELINE || path.resolve(__dirname,'../..')
let sequence = 0
const dir = fs.mkdtempSync(path.join(os.tmpdir(),'boothhana-v20-api-'))
const originalFetch = global.fetch
process.on('exit',()=>fs.rmSync(dir,{recursive:true,force:true}))
const response = (body,status=200) => new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}})
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {resolve,promise}}
async function fresh(t){
 const source=fs.readFileSync(path.join(root,'frontend/src/api/client.ts'),'utf8').replace('import.meta.env.VITE_API_BASE_URL',JSON.stringify('https://api.test'))
 const file=path.join(dir,`client-${++sequence}.mjs`)
 fs.writeFileSync(file,ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText)
 t.after(()=>{global.fetch=originalFetch});return import(pathToFileURL(file).href)
}
test('CSRF timeout remains active until JSON body has been read, then clears pending request',async t=>{
 const {api}=await fresh(t), timers=new Map(), originalSet=global.setTimeout, originalClear=global.clearTimeout
 let counter=0, writes=0, tokenCalls=0, bodyStarted=deferred(), timeoutSignal
 global.setTimeout=(fn,ms)=>{const id=++counter;timers.set(id,{fn,ms});return id};global.clearTimeout=id=>timers.delete(id)
 t.after(()=>{global.setTimeout=originalSet;global.clearTimeout=originalClear})
 global.fetch=async (url,init)=>{
  if(!url.endsWith('/csrf')){writes++;return response({ok:true})}
  tokenCalls++
  if(tokenCalls>1)return response({token:'fresh'})
  timeoutSignal=init.signal
  return {ok:true,status:200,json:()=>{bodyStarted.resolve();return new Promise((resolve,reject)=>{
   init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true})
  })}}
 }
 const first=api('/write',{method:'POST'}).then(()=>({ok:true}),error=>({error}))
 await bodyStarted.promise
 const live=[...timers.values()].find(t=>t.ms===15000)
 if(!live){ // Leave no hanging operation in the known-broken baseline.
  assert.ok(live,'15-second CSRF timeout was cleared at headers, before body consumption')
 }
 live.fn();const result=await first
 assert.ok(result.error);assert.equal(timeoutSignal.aborted,true);assert.equal(writes,0)
 await api('/write',{method:'POST'});assert.equal(writes,1);assert.equal(tokenCalls,2)
})
test('reset during pending CSRF initialization prevents old mutation from being sent',async t=>{
 const {api,resetCsrfToken}=await fresh(t), started=deferred(), release=deferred();let writes=0,tokens=0
 global.fetch=async url=>{if(url.endsWith('/csrf')){tokens++;if(tokens===1){started.resolve();await release.promise}return response({token:'T'+tokens})}writes++;return response({ok:true})}
 const first=api('/write',{method:'POST',body:'{"draft":"old"}'}).then(()=>null,error=>error)
 await started.promise;resetCsrfToken();release.resolve();const error=await first
 assert.equal(error?.code,'SESSION_CHANGED');assert.equal(writes,0)
 await api('/write',{method:'POST'});assert.equal(writes,1)
})
test('stale CSRF failure after explicit reset cannot replay the old payload with a new session',async t=>{
 const {api,resetCsrfToken}=await fresh(t), started=deferred(), release=deferred();let writes=0,tokens=0
 global.fetch=async url=>{if(url.endsWith('/csrf'))return response({token:'T'+(++tokens)});writes++;if(writes===1){started.resolve();await release.promise;return response({code:'CSRF_INVALID',message:'old'},403)}return response({ok:true})}
 const pending=api('/write',{method:'POST',body:'{"draft":"old"}'}).then(()=>null,error=>error)
 await started.promise;resetCsrfToken();release.resolve();const error=await pending
 assert.equal(error?.code,'SESSION_CHANGED');assert.equal(writes,1);assert.equal(tokens,1)
})
test('late old-session 401 must not invalidate a newer session token cache',async t=>{
 const {api,resetCsrfToken}=await fresh(t), started=deferred(), release=deferred();let tokens=0
 global.fetch=async url=>{if(url.endsWith('/csrf'))return response({token:'T'+(++tokens)});if(url.endsWith('/old-read')){started.resolve();await release.promise;return response({code:'UNAUTHORIZED',message:'old'},401)}return response({ok:true})}
 const old=api('/old-read').catch(e=>e);await started.promise;resetCsrfToken()
 await api('/new-write',{method:'POST'});release.resolve();await old
 await api('/another-write',{method:'POST'});assert.equal(tokens,1)
})
test('concurrent ordinary CSRF rejections still coalesce one refresh and retry each request only once',async t=>{
 const {api}=await fresh(t);let tokens=0;const writes=new Map()
 global.fetch=async (url,init)=>{if(url.endsWith('/csrf'))return response({token:'T'+(++tokens)});writes.set(url,(writes.get(url)||0)+1);return init.headers.get('X-XSRF-TOKEN')==='T1'?response({code:'CSRF_INVALID',message:'expired'},403):response({ok:true})}
 const out=await Promise.all([api('/write1',{method:'POST'}),api('/write2',{method:'POST'})]);assert.equal(tokens,2);assert.ok(out.every(x=>x.ok));assert.deepEqual([...writes.values()],[2,2])
})
test('reset after headers but before mutation JSON prevents delivering an old-session success',async t=>{
 const {api,resetCsrfToken}=await fresh(t), started=deferred(), release=deferred()
 global.fetch=async url=>url.endsWith('/csrf')?response({token:'T'}):{ok:true,status:200,json:async()=>{started.resolve();await release.promise;return {id:123}}}
 const pending=api('/write',{method:'POST'}).then(()=>null,error=>error)
 await started.promise;resetCsrfToken();release.resolve();assert.equal((await pending)?.code,'SESSION_CHANGED')
})
