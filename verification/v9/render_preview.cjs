/* Source JSX/CSS rendered with an explicit test harness. NOT a running React app. */
const fs=require('fs'),path=require('path');const {harness,toHtml,root}=require('../v6/source_harness.cjs'),{value,plan,date}=require('./fixtures.cjs')
const folder=path.join(root,'preview/v9');fs.mkdirSync(folder,{recursive:true})
const files=['styles/tokens.css','styles/global.css','features/catalog/catalog.css','features/discovery/discovery.css','features/floorplan/floorplan.css','features/visit/visit.css']
const css=files.map(f=>fs.readFileSync(path.join(root,'frontend/src',f),'utf8')).join('\n')
function build(view){
 const app=harness({location:{pathname:'/discover/10',search:`?day=${date}&hall=1관&view=${view==='drawer'?'booths':view}${view==='drawer'?'&booth=1':''}`},floorplanRemote:{loading:false,error:null,data:{plans:[plan],managedAssetIds:[]},reload:async()=>{}}})
 const detail=app.load('frontend/src/features/catalog/CatalogPublicPage.tsx').CatalogEventDetail
 const tree=app.render(detail,{eventId:'10',value},true)
 app.env.outlet=()=>tree
 const layout=app.load('frontend/src/components/layout/PublicLayout.tsx').PublicLayout
 function expand(node){if(!node||typeof node!=='object')return node;if(Array.isArray(node))return node.map(expand);if(typeof node.type==='function')return expand(app.render(node.type,node.props,true));const children=expand(node.props.children);const selected=node.type==='select'&&node.props.value!==undefined?[children].flat(Infinity).map(c=>c?.type==='option'?{...c,props:{...c.props,selected:String(c.props.value)===String(node.props.value)}}:c):children;return {...node,props:{...node.props,children:selected}}}
 let html=toHtml(expand(app.render(layout,{},true)))
 const logo=fs.readFileSync(path.join(root,'frontend/public/assets/brand/logo.png')).toString('base64');html=html.replaceAll('/assets/brand/logo.png','data:image/png;base64,'+logo)
 const script=`
 (function(){
 // Preview-only glue for native HTML controls; actual React/Router is not executing.
 const buttons=[...document.querySelectorAll('button')];
 const close=()=>{document.querySelector('.catalog-drawer')?.close();document.body.style.overflow=''};
 buttons.filter(b=>b.textContent==='닫기').forEach(b=>b.addEventListener('click',close));
 document.querySelectorAll('.visit-view-switch button').forEach((b,i)=>b.addEventListener('click',()=>location.href=['booths','map','info'][i]+'.html'));
 buttons.filter(b=>b.textContent==='지도에서 보기').forEach(b=>b.addEventListener('click',()=>location.href='map.html'));
 buttons.filter(b=>b.textContent==='상품 보기').forEach(b=>b.addEventListener('click',()=>location.href='drawer.html'));
 ${view==='drawer'?"const d=document.querySelector('.catalog-drawer');d.showModal();d.querySelector('h2').focus();document.body.style.overflow='hidden';d.addEventListener('cancel',()=>document.body.style.overflow='');":''}
 })();
 `
 const out=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>부스하나 v9 UI 확인용 가상 화면</title><style>${css}</style></head><body><div class="preview-disclaimer" style="padding:8px 14px;background:#ffefd0;color:#55340b;font-size:12px">v9 화면 확인용 가상 행사·상품·도면입니다. 실제 React 앱·DB·CLI 인식 결과가 아닙니다.</div>${html}<script>${script}</script></body></html>`
 fs.writeFileSync(path.join(folder,view+'.html'),out)
}
for(const view of ['booths','map','drawer','info'])build(view)
console.log('Rendered four source JSX/CSS fixture pages; preview-only glue, NOT React E2E.')
