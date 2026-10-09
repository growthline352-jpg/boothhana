/* Source JSX/hook harness for isolated tests and a static preview. NOT React DOM or React Router. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
const ts=require('../v4/load_ts.cjs')(),root=path.resolve(__dirname,'../..')
function harness(options={}){
 const cache=new Map(),slots=[];let cursor=0
 const env={location:{pathname:'/discover',search:'?category=subculture',state:null,...options.location},calls:[],slots,
  remote:options.remote||{loading:false,error:null,data:{items:[],page:0,size:20,total:0},reload:async()=>{}},auth:options.auth||{user:null,loading:false,loginUrl:'/api/auth/login',logout:async()=>{}},outlet:()=>null,history:[],navigationType:'POP'}
 const jsx=(type,props,key)=>({type,props:props||{},key})
 // This synchronous source harness cannot resolve Suspense promises. Preserve a
 // lazy component node without importing its browser dependencies; actual lazy
 // loading is covered by the release gate's React browser verification.
 const react={lazy:()=>function LazySourcePlaceholder(){return null},Suspense:props=>jsx('Fragment',{children:props.children}),createContext:value=>({value,Provider:props=>jsx('Fragment',{children:props.children})}),useContext:ctx=>ctx.value,useId:()=>`test-${cursor++}`,useState:init=>{let i=cursor++;if(!(i in slots))slots[i]=typeof init==='function'?init():init;return [slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v]},useRef:init=>{let i=cursor++;if(!(i in slots))slots[i]={current:init};return slots[i]},useEffect:()=>{},useLayoutEffect:()=>{},useMemo:fn=>fn(),useCallback:fn=>fn}
 const link=({to,state,children,...props})=>jsx('a',{...props,href:to,children})
 const router={Link:link,NavLink:link,Outlet:()=>env.outlet(),useLocation:()=>env.location,useParams:()=>options.params||{},useNavigationType:()=>env.navigationType,useBlocker:()=>options.blocker||{state:'unblocked'},useNavigate:()=>to=>{env.calls.push('NAV:'+to);if(to===-1&&env.history.length){Object.assign(env.location,env.history.pop());env.navigationType='POP'}},useSearchParams:()=>[new URLSearchParams(env.location.search),(next,config={})=>{const query=new URLSearchParams(next).toString();env.calls.push(query);if(!config.replace)env.history.push({...env.location});Object.assign(env.location,{search:'?'+query,state:config.state||null});env.navigationType=config.replace?'REPLACE':'PUSH'}]}
 const api={catalogApi:options.catalogApi||{},publicCatalogApi:{browse:async query=>{env.calls.push('API:'+query);return env.remote.data},event:async()=>env.remote.data,events:async()=>env.remote.data}}
 function load(rel){let file=path.isAbsolute(rel)?rel:path.join(root,rel),normalizedFile=file.replace(/\\/g,'/');if(cache.has(file))return cache.get(file)
  if(file.endsWith('.css'))return{}
  const module={exports:{}};cache.set(file,module.exports)
  const result=ts.transpileModule(fs.readFileSync(file,'utf8').replace(/\bimport\.meta\.env\b/g,'({})'),{fileName:file.replace(/\.mjs$/,'.js'),compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}})
  function requireLocal(name){
   // Source-only JSX checks retain portal content; focus and the top layer need a real browser.
   if(name==='react-dom')return {createPortal:children=>children};
   if(name.endsWith('/PageMetadata'))return {PageMetadata:()=>null,RouteMetadata:()=>null};
   if(name==='qrcode')return {default:{toDataURL:async()=>"data:image/png;base64,TEST_ONLY"},toDataURL:async()=>"data:image/png;base64,TEST_ONLY"};
   // Vite's import.meta.env is valid in the browser build but cannot be parsed by
   // this CommonJS VM harness. Components under test only need the resolved base.
   if(name.endsWith('/api/client'))return {API_BASE_URL:'https://api.test',...options.apiClient};
   if(name.endsWith('/library/LibraryProvider')||name==='./LibraryProvider')return {useLibrary:()=>options.library||{owner:'guest',index:[],guest:[],version:0,loading:false,error:'',refresh:async()=>{}},resolveGuestPage:async()=>[]};
   if(normalizedFile.includes('/library/')&&name==='./api')return {libraryApi:options.libraryApi||{}};
   if(name==='react')return {...react,...options.reactOverrides}
   if(name==='react/jsx-runtime')return{jsx,jsxs:jsx,Fragment:'Fragment'}
   if(name==='react-router')return router
   if(name.endsWith('/api/image-upload'))return {ImageUploadController:class{},ImageUploadTask:class{}}
   if(name.endsWith('/useAuth'))return{useAuth:()=>env.auth}
   if(name.endsWith('/useRemote'))return{useRemote:(_namespace,fn)=>{if(options.callLoader)void fn();if(fn.toString().includes('purchaseApi.list'))return options.purchaseRemote||{loading:false,error:null,data:[],reload:async()=>{}};return normalizedFile.includes('/floorplan/')?(options.floorplanRemote||{loading:false,error:null,data:{plans:[],managedAssetIds:[]},reload:async()=>{}}):env.remote}}
   if(normalizedFile.includes('/support/')&&name==='./api')return {supportApi:options.supportApi||{}}
   if(normalizedFile.includes('/goods/')&&name==='./api')return {goodsApi:options.goodsApi||{bestsellers:async()=>({basis:'POS_LOGGED_UNITS',windowDays:30,from:'2026-08-17T00:00:00Z',to:'2026-09-16T00:00:00Z',asOf:'2026-09-16T00:00:00Z',items:[]})}}
   if(normalizedFile.includes('/floorplan/')&&name==='./api')return {floorplanApi:options.floorplanApi||{}}
   if(name==='../../api'||name==='../api')return {creatorApi:{},adminApi:{},authApi:{}}
   if(name==='./api'&&normalizedFile.includes('/catalog/'))return api
   if(name==='../catalog/api'||((file.endsWith('CatalogPublicPage.tsx')||file.endsWith('BannerSelectionPanel.tsx')||file.endsWith('CatalogAdminPage.tsx'))&&name==='./api'))return api
   if(name.endsWith('.css'))return{}
   let target=path.resolve(path.dirname(file),name)
   for(const suffix of ['', '.ts','.tsx','/index.ts'])if(fs.existsSync(target+suffix)&&fs.statSync(target+suffix).isFile())return load(target+suffix)
   throw new Error('Unmocked import '+name+' in '+file)
  }
  class FixedDate extends Date {constructor(...args){super(...(args.length?args:['2026-09-16T00:00:00Z']))} static now(){return new Date('2026-09-16T00:00:00Z').getTime()}}
  vm.runInNewContext(result.outputText,{require:requireLocal,module,exports:module.exports,URL,URLSearchParams,Intl,Date:FixedDate,Error,crypto:require('node:crypto').webcrypto,btoa:s=>Buffer.from(s,'binary').toString('base64'),console,setTimeout,clearTimeout,requestAnimationFrame:fn=>{fn();return 1},cancelAnimationFrame:()=>{},navigator:options.navigator||{},window:{location:{origin:'https://boothhana.test'},scrollTo:()=>{},setInterval,clearInterval,confirm:options.confirm||(()=>true)},document:{title:'부스하나'}},{filename:file})
  return module.exports
 }
 function render(fn,props={},fresh=false){if(fresh)slots.length=0;cursor=0;return fn(props)}
 return {...env,env,load,render,jsx}
}
const esc=value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
function toHtml(node){if(node==null||typeof node==='boolean')return'';if(Array.isArray(node))return node.map(toHtml).join('');if(typeof node!=='object')return esc(node)
 if(typeof node.type==='function')return toHtml(node.type(node.props));if(node.type==='Fragment')return toHtml(node.props.children)
 const props=node.props,tag=node.type;let attrs='';const bools=new Set(['disabled','checked','selected','multiple','required','open','hidden','autoFocus'])
 for(let [k,v] of Object.entries(props)){if(k==='children'||k==='key'||k==='ref'||k==='state'||k==='value'&&tag==='textarea'||k.startsWith('on')||v==null)continue
  if(['strokeWidth','strokeLinecap','strokeLinejoin','fillRule','clipRule','strokeDasharray'].includes(k))k=k.replace(/[A-Z]/g,c=>'-'+c.toLowerCase());
  if(k==='className')k='class';if(k==='htmlFor')k='for';if(k==='tabIndex')k='tabindex';if(k==='readOnly')k='readonly'
  if(bools.has(k)){if(v)attrs+=' '+k;continue} if(typeof v==='boolean'){if(k.startsWith('aria-'))attrs+=` ${k}="${v}"`;continue}
  if(k==='style'&&typeof v==='object')v=Object.entries(v).map(([a,b])=>a.replace(/[A-Z]/g,x=>'-'+x.toLowerCase())+':'+b).join(';')
  attrs+=` ${k}="${esc(v)}"`
 }
 if(['input','img','br','hr','meta','link'].includes(tag))return`<${tag}${attrs}>`
 return`<${tag}${attrs}>${tag==='textarea'?esc(props.value||''):toHtml(props.children)}</${tag}>`
}
function nodes(n){if(n==null||typeof n!=='object')return[];if(Array.isArray(n))return n.flatMap(nodes);return[n,...nodes(n.props?.children)]}
module.exports={harness,toHtml,nodes,root}
