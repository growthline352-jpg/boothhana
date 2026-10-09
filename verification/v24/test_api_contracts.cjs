const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os')
const {pathToFileURL}=require('node:url')
const {prepareApiClient}=require('../v4/load_api_client.cjs')
const {loadSource}=require('../v21/load_source.cjs')
const root=process.env.BOOTHHANA_REVIEW_BASELINE||path.resolve(__dirname,'../..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'booth-v24-api-'));let index=0
process.on('exit',()=>fs.rmSync(dir,{recursive:true,force:true}))
async function client(t,base='https://api.example.com'){
 const out=prepareApiClient(root,path.join(dir,String(++index)),base)
 const old=global.fetch;t.after(()=>global.fetch=old);return import(pathToFileURL(out).href)
}
const json=x=>new Response(JSON.stringify(x),{headers:{'Content-Type':'application/json'}})
test('floorplan withdrawal wire response agrees with JSON client (actual source annotation; HTTP boundary simulated)',async t=>{
 const c=await client(t);const source=fs.readFileSync(path.join(root,'backend/src/main/java/com/boothhana/floorplan/FloorplanAdminController.java'),'utf8')
 const declaration=source.match(/@PostMapping\("\/versions\/\{id\}\/withdraw"\)([\s\S]*?)public void withdraw/)[1]
 const status=/ResponseStatus\(HttpStatus.NO_CONTENT\)/.test(declaration)?204:200;let calls=0
 global.fetch=async(url,init)=>{if(url.endsWith('/csrf'))return json({token:'csrf'});calls++;assert.equal(init.method,'POST');assert.equal(JSON.parse(init.body).revision,2);return new Response(null,{status})}
 const {floorplanApi}=loadSource('frontend/src/features/floorplan/api.ts',{'../../api/client':c})
 await assert.doesNotReject(()=>floorplanApi.withdraw({id:'9b89617c-fc9a-4be5-87e6-32eb6eafaf0f',revision:2},'철회'))
 assert.equal(calls,1);assert.equal(status,204)
})
test('trailing slashes and whitespace cannot turn API routes into double-slash paths',async t=>{
 const c=await client(t,' https://api.example.com/// ');const urls=[]
 global.fetch=async url=>{urls.push(url);return url.endsWith('/csrf')?json({token:'csrf'}):json({ok:true})}
 await c.api('/api/example',{method:'POST',body:'{}'})
 assert.deepEqual(urls,['https://api.example.com/api/auth/csrf','https://api.example.com/api/example'])
})
for(const base of ['https://api.example.com/api','https://api.example.com?x=1','https://api.example.com#api','https://secret:password@api.example.com']){
 test(`non-origin API configuration is rejected before requests: ${base.replace('secret:password@','[credentials]@')}`,async t=>{
  await assert.rejects(()=>client(t,base),/VITE_API_BASE_URL/)
 })
}
test('an intentionally empty API base still uses same-origin relative requests',async t=>{
 const c=await client(t,'');let url;global.fetch=async u=>{url=u;return json({ok:true})};await c.api('/api/public/events');assert.equal(url,'/api/public/events')
})
test('204 normal response stays empty and ordinary JSON is not discarded',async t=>{
 const c=await client(t);global.fetch=async u=>u.endsWith('/empty')?new Response(null,{status:204}):json({id:5})
 assert.equal(await c.api('/empty'),undefined);assert.deepEqual(await c.api('/json'),{id:5})
})
