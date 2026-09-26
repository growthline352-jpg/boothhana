/* Static visual samples from product JSX/CSS. Synthetic data + stubbed hooks/API;
   no React hydration, no real event data, no transactional actions. */
const fs=require('node:fs'),path=require('node:path');
const {setup,jsx,defaultLibrary}=require('./support/views.cjs');
const {runtime}=require('../v22/support/runtime.cjs');
const {setup:librarySetup}=require('./support/library.cjs');
const root=process.env.BOOTHHANA_REVIEW_BASELINE||path.resolve(__dirname,'../..');
const output=process.env.BOOTHHANA_PREVIEW_OUT||path.resolve(root,'preview/v23');
fs.mkdirSync(output,{recursive:true});
const esc=x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const empty=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
const bools=new Set(['disabled','checked','selected','open','multiple','required','readOnly','autoFocus','hidden','inert']);
const attrs={className:'class',htmlFor:'for',tabIndex:'tabindex',readOnly:'readonly',autoFocus:'autofocus',strokeWidth:'stroke-width',strokeLinecap:'stroke-linecap',strokeLinejoin:'stroke-linejoin',fillRule:'fill-rule',clipRule:'clip-rule'};
let inner='',panel='';
const logo=fs.readFileSync(path.join(root,'frontend/public/assets/brand/logo.png')).toString('base64');
function html(n,depth=0){
 if(depth>80)throw Error('Recursive preview node');
 if(n==null||typeof n==='boolean')return '';
 if(Array.isArray(n))return n.map(v=>html(v,depth+1)).join('');
 if(typeof n!=='object')return esc(n);
 if(typeof n.type==='function')return html(n.type(n.props),depth+1);
 if(n.type==='Fragment')return html(n.props.children,depth+1);
 if(n.type==='Outlet')return inner;
 if(n.type==='OfflineDownloadPanel')return panel;
 if(!/^[a-z][a-z0-9-]*$/.test(n.type))return html(n.props.children,depth+1);
 const p=n.props||{},a=[];
 let children=p.children;
 if(n.type==='select'&&p.value!=null){const choose=x=>Array.isArray(x)?x.map(choose):x&&typeof x==='object'?{...x,props:{...x.props,...(x.type==='option'?{selected:String(x.props.value)===String(p.value)}:{}),children:choose(x.props.children)}}:x;children=choose(children)}
 if(n.type==='textarea'&&p.value!=null)children=p.value;
 for(let [k,v] of Object.entries(p)){
  if(v==null||k==='children'||k==='ref'||k==='key'||k==='to'||k==='dangerouslySetInnerHTML'||k.startsWith('on')||typeof v==='function')continue;
  if(k==='style'){v=Object.entries(v).map(([s,x])=>`${s.replace(/[A-Z]/g,m=>'-'+m.toLowerCase())}:${typeof x==='number'&&x!==0&&!['opacity','zIndex','flex','order','fontWeight','lineHeight'].includes(s)?x+'px':x}`).join(';')}
  if(k==='src'&&v==='/assets/brand/logo.png')v='data:image/png;base64,'+logo;
  if(bools.has(k)){if(v)a.push(attrs[k]||k);continue}
  if(typeof v==='object')continue;
  a.push(`${attrs[k]||k}="${esc(v)}"`);
 }
 return `<${n.type}${a.length?' '+a.join(' '):''}>${empty.has(n.type)?'':html(children,depth+1)+`</${n.type}>`}`;
}
const ph=runtime({resolve(name){
 if(name.endsWith('/auth-context'))return {AuthContext:{value:{getSnapshot:()=>({status:'anonymous',user:null})}}};
 if(name.endsWith('/api/client'))return {API_BASE_URL:'https://invalid.example'};
 if(name.endsWith('/LibraryProvider'))return {useLibrary:()=>defaultLibrary};
 if(name.endsWith('/offlineModule'))return {loadOfflineModule:async()=>{throw Error('Static preview')}};
 if(name.endsWith('/OfflinePrivacyGuard'))return {offlineOwner:()=> 'guest'};
}});
const P=ph.load('frontend/src/features/offline/OfflineDownloadPanel.tsx').OfflineDownloadPanel;
panel=html(ph.render(P,{eventId:1,day:'2026-10-03'}));
const styles=['features/support/support.css','features/discovery/discovery.css','features/catalog/catalog.css','features/visit/visit.css','styles/tokens.css','styles/global.css','styles/polish.css','features/library/library.css','styles/usability.css'];
const css=styles.filter(f=>fs.existsSync(path.join(root,'frontend/src',f))).map(f=>`/* ${f} */\n`+fs.readFileSync(path.join(root,'frontend/src',f),'utf8')).join('\n');
for(const [file,kind,search,label] of [
 ['discovery.html','discovery','','행사 탐색'],
 ['detail.html','catalog','','행사 상세 · 부스 찾기'],
 ['library.html','library','','보관함 · 빈 상태'],
 ['invalid-dates.html','discovery','period=custom&from=2026-10-04&to=2026-10-01','날짜 오류 안내'],
]){
 inner=html(kind==='library'?librarySetup({owner:'guest'}).render():setup({kind,search}).render());
 const body=html(setup({kind:'layout',search,routePath:kind==='library'?'/library':''}).render());
 fs.writeFileSync(path.join(output,file),`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>부스하나 v23 정적 검토 · ${label}</title><style>${css}\n.preview-disclaimer{margin:0;padding:8px 16px;background:#202c3b;color:#fff;font:12px/1.6 sans-serif;text-align:center}.preview-disclaimer a{color:#fff;text-decoration:underline;margin:0 8px}</style></head><body><aside class="preview-disclaimer">가상 자료 · 실제 소스 기반 정적 검토 / 로그인·검색·저장 미연결<a href="discovery.html">행사 탐색</a><a href="detail.html">행사 상세</a><a href="library.html">보관함</a><a href="invalid-dates.html">오류 상태</a></aside>${body}</body></html>`);
}
console.log(JSON.stringify({output,pages:4,mode:'synthetic JSX + source CSS; static only'}));
