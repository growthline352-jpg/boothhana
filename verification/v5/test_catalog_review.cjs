/* Actual TS/TSX modules, minimal hook/JSX harness. No real React DOM or network. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict')
const ts=require('../v4/load_ts.cjs')(),ROOT=path.resolve(__dirname,'../..');let checks=0
const ok=(condition,label)=>{assert.ok(condition,label);checks++;console.log('PASS '+label)}
const jsx=(type,props,key)=>({type,props:props||{},key}),calls=[]
const save=async(id,body)=>{calls.push({id,body});return {}}
let slots=[],position=0
const react={useState:initial=>{let index=position++;if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;return [slots[index],v=>slots[index]=typeof v==='function'?v(slots[index]):v]}}
const modules=new Map()
function load(rel,extra='') {
 const filename=path.join(ROOT,rel);if(!extra&&modules.has(filename))return modules.get(filename)
 const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(filename,'utf8')+'\n'+extra,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText
 function rq(p){
  if(p==='react')return react
  if(p.endsWith('/UnsavedChanges'))return {useDirty:()=>()=>{},useUnsavedGuard:()=>()=>true,UnsavedChangesProvider:props=>jsx('Fragment',props)}
  if(p.endsWith('/eventStatus'))return {unknownOperation:{state:'UNKNOWN',note:null,sourceUrl:null,checkedOn:null}}
  if(p==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'Fragment'}
  if(p==='react-router')return {Link:props=>jsx('a',props)}
  if(p.endsWith('/useRemote'))return {useRemote:()=>({loading:false,error:null,data:{items:[],total:0},reload:async()=>{}})}
  if(p.endsWith('/useSubmission'))return {useSubmission:()=>({pending:false,begin:()=>true,finish:()=>{}})}
  if(p==='./api')return {catalogApi:{editEvent:save,editParticipant:save,editSales:save}}
  if(p==='./Shared')return load('frontend/src/features/catalog/Shared.tsx')
  if(p==='./reviewChanges')return load('frontend/src/features/catalog/reviewChanges.ts')
  return {}
 }
 vm.runInNewContext(code,{require:rq,exports:module.exports,module,URL,console,window:{confirm:()=>true}})
 if(!extra)modules.set(filename,module.exports);return module.exports
}
const shared=load('frontend/src/features/catalog/Shared.tsx'),rules=load('frontend/src/features/catalog/reviewChanges.ts')
const admin=load('frontend/src/features/catalog/CatalogAdminPage.tsx','export {EventEditor,ParticipantEditor,SalesEditor,Participants,OverridePanel,EventList,BatchRuns};')
const fixture=n=>JSON.parse(fs.readFileSync(path.join(ROOT,'collector/examples/v5',n+'.json')))
const participant=fixture('participants').participants[0],sales=fixture('sales').sales,event=fixture('events').events[0]
const row={id:21,eventId:11,revision:1,reviewState:'PENDING',data:participant,collectedData:participant,reviewNote:'',overrides:{},assets:[],sales:null}
const detail={id:11,revision:1,event,collectedEvent:event,note:'',overrides:{},reviewState:'PENDING',possibleDuplicateOf:null}
const salesRow={...row,sales:{revision:1,reviewState:'PENDING',data:sales,collectedData:sales,reviewNote:'',overrides:{}}}
function render(fn,props,fresh=false){if(fresh)slots=[];position=0;return fn(props)}
function nodes(n){if(!n)return[];if(Array.isArray(n))return n.flatMap(nodes);if(typeof n!=='object')return[];return[n,...nodes(n.props?.children)]}
function component(tree,name){return nodes(tree).find(n=>typeof n.type==='function'&&n.type.name===name)}
const plain=x=>JSON.parse(JSON.stringify(x));const flush=()=>new Promise(r=>setImmediate(r))
async function approve(fn,props){const tree=render(fn,props,true);component(tree,'ReviewButtons').props.save('REVIEWED');await flush();return calls.pop().body}
;(async()=>{
 for(const [name,props] of [['EventEditor',{detail}],['ParticipantEditor',{row}],['SalesEditor',{row:salesRow}]]) {
  const body=await approve(admin[name],{...props,saved:()=>{}})
  ok(Object.keys(body.overrides).length===0,name+' unchanged review does not pin fields')
  ok(body.reviewState==='REVIEWED',name+' review state still saved')
 }
 let tree=render(admin.ParticipantEditor,{row,saved:()=>{}},true)
 nodes(tree).find(n=>n.type==='input'&&n.props.value===participant.registrationName).props.onChange({target:{value:'Corrected name'}})
 tree=render(admin.ParticipantEditor,{row,saved:()=>{}});component(tree,'ReviewButtons').props.save('REVIEWED');await flush()
 const patch=calls.pop().body.overrides;ok(JSON.stringify(patch)==='{"registrationName":"Corrected name"}','only edited participant field sent')
 ok(!('locations' in patch),'unchanged B1 is not pinned after name correction')
 tree=render(admin.ParticipantEditor,{row:{...row,overrides:{locations:participant.locations}},saved:()=>{}},true)
 component(tree,'OverridePanel').props.restore(['locations']);await flush();let clear=calls.pop().body
 ok(clear.clearOverrides[0]==='locations'&&Object.keys(clear.overrides).length===0,'restore removes override rather than setting null')
 ok(clear.reviewState==='PENDING','restore requires fresh review')
 const changedLocation={...participant,locations:[{...participant.locations[0],code:'Z-99'}]}
 tree=render(admin.ParticipantEditor,{row:{...row,data:changedLocation,collectedData:changedLocation},saved:()=>{}},true)
 ok(nodes(tree).some(n=>n.type==='input'&&n.props.value==='Z-99'),'refreshed collected booth position visible')
 const eNull={...detail,event:{...event,admission:null,address:null,venueName:null}}
 const nullBody=await approve(admin.EventEditor,{detail:eNull,saved:()=>{}});ok(Object.keys(nullBody.overrides).length===0,'nullable empty event fields do not create empty-string overrides')
 tree=render(admin.SalesEditor,{row:salesRow,saved:()=>{}},true);nodes(tree).find(n=>n.type==='textarea'&&n.props.value===sales.summary).props.onChange({target:{value:'Actual correction'}})
 tree=render(admin.SalesEditor,{row:salesRow,saved:()=>{}});component(tree,'ReviewButtons').props.save('REVIEWED');await flush()
 ok(JSON.stringify(calls.pop().body.overrides)==='{"summary":"Actual correction"}','only sales summary edited, scope unpinned')
 for(const state of ['PLANNED','ON_SALE','SOLD_OUT','CANCELED','UNKNOWN']){
  tree=shared.ProductCard({product:{...sales.products[0],saleState:state,warnings:['TEST warning']}})
  const text=JSON.stringify(plain(tree));ok(text.includes(shared.saleStates[state]),state+' specific sale state visible');ok(text.includes('TEST warning'),state+' warning displayed')
 }
 tree=shared.ProductCard({product:sales.products[0],verification:{state:'NOT_RECONFIRMED',lastSeenAt:'2026-09-16T00:00:00Z'}})
 ok(JSON.stringify(plain(tree)).includes('최근 수집에서 재확인되지 않음'),'missing this run retained item is marked stale')
 ok(JSON.stringify(component(tree,'SafeLink').props.children).includes('판매 상태 확인'),'stale item not linked as current sale')
 ok(rules.sameValue({a:1,b:{c:2}},{b:{c:2},a:1}),'object order not a field change')
 ok(!rules.sameValue([1,2],[2,1]),'array order retained intentionally')
 ok(Object.hasOwn(rules.changedFields({a:'x'},{a:null}),'a'),'explicit null different from override removal')
 for(const invalid of ['[]','null','{"__proto__":{}}']){let failed=false;try{rules.parseObject(invalid)}catch{failed=true}ok(failed,'unsafe/non-object JSON rejected '+invalid)}
 for(const name of ['Participants','EventList','BatchRuns']){render(admin[name],{eventId:11,open:()=>{}},true);ok(true,name+' empty-route render without undefined locals')}
 console.log(`PASS: ${checks} v5 editor/diff/product/harness checks. Not a React DOM test.`)
})().catch(e=>{console.error(e);process.exit(1)})
