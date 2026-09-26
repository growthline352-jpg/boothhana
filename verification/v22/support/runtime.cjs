/* A deliberately small, synchronous hook/JSX test double. Actual TS modules are
 * executed. This is NOT React reconciliation, a DOM, or an end-to-end browser. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('../../v4/load_ts.cjs')();
const root=process.env.BOOTHHANA_REVIEW_BASELINE||path.resolve(__dirname,'../../..');
const jsx=(type,props,key)=>({type,props:props||{},key});
const nodes=n=>n==null||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];
const text=n=>n==null||typeof n==='boolean'?'':Array.isArray(n)?n.map(text).join(''):typeof n==='object'?text(n.props?.children):String(n);
const component=name=>({[name]:function(props){return jsx(name,props)}})[name];
function runtime(options={}){
 const cache=new Map(),slots=[],pending=[];let cursor=0,fn,props;
 const same=(a,b)=>!!a&&!!b&&a.length===b.length&&a.every((x,i)=>Object.is(x,b[i]));
 const hooks={
  useState(init){const i=cursor++;if(!slots[i])slots[i]={value:typeof init==='function'?init():init};return[slots[i].value,v=>slots[i].value=typeof v==='function'?v(slots[i].value):v]},
  useRef(init){const i=cursor++;if(!slots[i])slots[i]={value:{current:init}};return slots[i].value},
  useMemo(f,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={value:f(),deps};return slots[i].value},
  useCallback(f,deps){return hooks.useMemo(()=>f,deps)},
  useEffect(f,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps)){const old=slots[i];slots[i]={deps,cleanup:old?.cleanup};pending.push(()=>{slots[i].cleanup?.();slots[i].cleanup=f()})}},
  useLayoutEffect(f,deps){hooks.useEffect(f,deps)},
  createContext(value){return {value,Provider:component('Provider')}},useContext(c){return c.value},useId(){return `test-${cursor++}`},
 };
 const overrides={react:hooks,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},...options.overrides};
 function load(relative){const file=path.isAbsolute(relative)?relative:path.resolve(root,relative);if(cache.has(file))return cache.get(file).exports;
  const m={exports:{}};cache.set(file,m);
  const src=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const requireLocal=name=>{if(Object.hasOwn(overrides,name))return overrides[name];const supplied=options.resolve?.(name,file);if(supplied!==undefined)return supplied;if(name.endsWith('.css'))return {};if(!name.startsWith('.'))throw Error('Unmocked external dependency '+name);
   const base=path.resolve(path.dirname(file),name);for(const ext of ['', '.ts','.tsx','/index.ts'])if(fs.existsSync(base+ext)&&fs.statSync(base+ext).isFile())return load(base+ext);throw Error('Missing import '+name)};
  vm.runInNewContext(src,{require:requireLocal,module:m,exports:m.exports,console,URL,URLSearchParams,Intl,Date,Error,Map,Set,Promise,crypto:require('node:crypto').webcrypto,Blob,setTimeout,clearTimeout,setInterval,clearInterval,...options.globals},{filename:file});return m.exports;
 }
 return {hooks,slots,load,render(f=fn,p=props){fn=f;props=p;cursor=0;return f(p)},flushEffects(){while(pending.length)pending.shift()()},unmount(){for(const s of slots)s?.cleanup?.()},overrides};
}
const wait=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}};
module.exports={runtime,nodes,text,component,jsx,wait,root};
