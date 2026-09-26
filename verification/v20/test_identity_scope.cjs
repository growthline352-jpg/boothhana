/** Executes actual AuthSession, logout wrapper and download panel with explicit dependencies/hooks.
 * This is state/closure behavior, not a real React renderer or browser login flow. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
const ts=require('../v4/load_ts.cjs')()
const root=process.env.BOOTHHANA_REVIEW_BASELINE||path.resolve(__dirname,'../..')
const transpile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText
function load(relative,overrides={}){
 const cache=new Map()
 function read(file){if(cache.has(file))return cache.get(file).exports;const module={exports:{}};cache.set(file,module)
  const requireHere=name=>{if(name in overrides)return overrides[name];if(!name.startsWith('.'))throw Error('Unmocked dependency '+name);const target=path.resolve(path.dirname(file),name);return read(fs.existsSync(target+'.ts')?target+'.ts':target+'.tsx')}
  new Function('require','module','exports',transpile(file))(requireHere,module,module.exports);return module.exports
 }
 return read(path.resolve(root,relative))
}
const A={id:1,displayName:'A',permissions:['FAN','CREATOR']},B={id:2,displayName:'B',permissions:['FAN','CREATOR']}
test('known identity or permission change invalidates requests once; same-user focus and temporary errors do not',async()=>{
 const {AuthSession}=load('frontend/src/app/AuthSession.ts');let who=A,calls=0,error=null
 const session=new AuthSession(async()=>{if(error)throw error;return who},async()=>{},()=>calls++)
 await session.refresh();assert.equal(calls,1)
 await session.refresh();assert.equal(calls,1)
 error={status:503};await session.refresh();assert.equal(session.read().status,'error');assert.equal(calls,1)
 error=null;await session.refresh();assert.equal(calls,1)
 who=B;await session.refresh();assert.equal(calls,2)
 who={...B,permissions:['FAN']};await session.refresh();assert.equal(calls,3)
 error={status:401};await session.refresh();assert.equal(calls,4)
 await session.refresh();assert.equal(calls,4)
})
for(const fails of [false,true])test(`logout invalidates old pending requests before the HTTP call and again after ${fails?'failure':'success'}`,async()=>{
 const calls=[]
 const {authApi}=load('frontend/src/api/index.ts',{
  './client':{resetCsrfToken(){calls.push('reset')},async api(url){calls.push(url);if(fails)throw Error('network')}},
  './image-upload':{createImageUploadTask(){}},
 })
 try{await authApi.logout()}catch(e){assert.ok(fails)}
 assert.deepEqual(calls,['reset','/api/logout','reset'])
})
const tick=async()=>{for(let i=0;i<4;i++)await new Promise(setImmediate)}
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {resolve,promise}}
function panelHarness(){
 let cursor=0,props={eventId:1,day:'2026-09-20'},tree,rendered=false,download=null
 const slots=[],effectQueue=[]
 const react={useContext:()=>({getSnapshot:()=>({status:'anonymous',user:null})}),
  useRef(initial){const i=cursor++;slots[i]??={current:initial};return slots[i]},
  useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next}]},
  useEffect(fn,deps){const i=cursor++,previous=slots[i];if(!previous||deps.some((x,n)=>x!==previous.deps[n]))effectQueue.push(()=>{previous?.clean?.();slots[i]={deps,clean:fn()}})},
 }
 const jsx=(type,props)=>({type,props:props||{}})
 const wait=deferred()
 const {OfflineDownloadPanel}=load('frontend/src/features/offline/OfflineDownloadPanel.tsx',{
  react,'react/jsx-runtime':{jsx,jsxs:jsx},'../../app/auth-context':{AuthContext:{}},'../../api/client':{API_BASE_URL:'https://api.test'},
  '../library/LibraryProvider':{useLibrary:()=>({owner:'guest',loading:false,error:'',index:[]})},
  './OfflinePrivacyGuard':{offlineOwner:()=> 'guest'},
  './offlineModule':{loadOfflineModule:async()=>({syncOwner:async()=>{},downloadEvent:async args=>{download=args;await wait.promise;return {bytes:0,missing:[],omittedImages:0,noApprovedPlan:true}}})},
 })
 function render(next=props,{effects=true}={}){props=next;cursor=0;tree=OfflineDownloadPanel(props);if(effects){while(effectQueue.length)effectQueue.shift()()}rendered=true;return tree}
 function all(node=tree){if(!node||typeof node!=='object')return [];return [node,...[].concat(node.props?.children||[]).flat(Infinity).flatMap(all)]}
 return {render,all,get download(){return download},finish:()=>wait.resolve(),state:slots}
}
test('changing only the visit day cancels a pending export before old-day data can commit',async()=>{
 const h=panelHarness();h.render();h.all().find(x=>x.type==='input'&&x.props.type==='checkbox').props.onChange({target:{checked:true}});h.render()
 h.all().find(x=>x.type==='button'&&x.props.className==='btn primary').props.onClick();await tick()
 assert.ok(h.download);assert.equal(h.download.stillAllowed(),true)
 h.render({eventId:1,day:'2026-09-21'},{effects:false})
 assert.equal(h.download.stillAllowed(),false,'the day must be checked during render, before effects')
 h.finish();await tick()
})
test('visit-day change clears prior consent and completion UI without clearing saved event files',async()=>{
 const h=panelHarness();h.render();h.all().find(x=>x.type==='input'&&x.props.type==='checkbox').props.onChange({target:{checked:true}});h.render()
 assert.equal(h.all().find(x=>x.type==='input'&&x.props.type==='checkbox').props.checked,true)
 h.render({eventId:1,day:'2026-09-21'});h.render()
 assert.equal(h.all().find(x=>x.type==='input'&&x.props.type==='checkbox').props.checked,false)
})
