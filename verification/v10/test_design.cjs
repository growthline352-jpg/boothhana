/* Design contracts on actual source JSX and CSS. No live React/Router/API. */
const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const {harness,nodes,toHtml,root}=require('./source_harness.cjs');
let count=0;const check=(v,label)=>{assert.ok(v,label);count++};
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
let postcss;try{postcss=require(require.resolve('postcss',{paths:[path.join(root,'frontend'),...require('node:module').globalPaths]}))}catch{postcss=require('node:module').createRequire(require.resolve('vite',{paths:[path.join(root,'frontend')]}))('postcss')}
const main=read('frontend/src/main.tsx');
check(main.lastIndexOf("import './styles/polish.css'")>main.lastIndexOf("import './styles/global.css'"),'visual layer imported after global');
check((main.match(/import '\.\/styles\/polish.css'/g)||[]).length===1,'single visual layer');
for(const f of ['frontend/src/styles/tokens.css','frontend/src/styles/polish.css']){
 const css=read(f);postcss.parse(css,{from:f});check(true,`${f}: CSS parse`);
 check(!/@font-face|@import\s+url|https?:\/\//i.test(css),`${f}: no external fonts/styles/assets`);
}
const css=read('frontend/src/styles/polish.css');
for(const media of ['prefers-reduced-motion','forced-colors','max-width: 600px','max-width: 360px'])check(css.includes(media),media);
check(css.includes('[hidden] { display: none !important; }'),'hidden tab panels stay hidden');
check(!/\.floorplan-region[^{}]*\{[^}]*\b(?:display:\s*none|pointer-events:\s*none|transform:)/.test(css),'no polygon geometry/click change');
for(const category of ['subculture','exhibitions','festivals']){
 const a=harness({location:{pathname:'/discover',search:`?category=${category}`}});
 const tree=a.render(a.load('frontend/src/components/layout/PublicLayout.tsx').PublicLayout,{},true);
 check(tree.props['data-category']===category,`${category} theme scope`);
 const nav=nodes(tree).filter(n=>n.props?.className?.includes?.('discovery-category-link'));
 check(nav.length===3,`${category} navigation unchanged`);
 check(nodes(tree).some(n=>n.props?.['aria-label']==='내 예약'),`${category} accessible reservations`);
}
for(const opts of [{auth:{loading:true,user:null},message:'계정을 확인'}, {auth:{loading:false,user:null,loginUrl:'/login'},message:'로그인이 필요'}, {auth:{loading:false,user:{id:1,displayName:'예시',permissions:['FAN']}},message:'접근 권한이 없습니다'}]){
 const a=harness(opts),t=a.render(a.load('frontend/src/components/layout/ConsoleLayout.tsx').ConsoleLayout,{role:'ADMIN'},true);
 check(toHtml(t).includes(opts.message),'console access state retained');
 check(!nodes(t).some(n=>n.type==='main'),'no unauthorized console content');
}
for(const role of ['ADMIN','CREATOR']){
 const a=harness({auth:{loading:false,user:{id:1,displayName:'검증사용자',permissions:[role]}}});
 const t=a.render(a.load('frontend/src/components/layout/ConsoleLayout.tsx').ConsoleLayout,{role},true);
 const ns=nodes(t);check(ns.filter(n=>n.type==='main').length===1,`${role} main landmark`);
 check(ns.some(n=>n.props?.href==='#console-main'),`${role} skip link`);
 const nav=ns.find(n=>n.props?.className==='side-nav');const links=nodes(nav).filter(n=>n.props?.to).map(n=>n.props.to);
 assert.deepEqual(links,role==='ADMIN'?['/admin/events','/admin/goods-showcase','/admin/applications','/admin/reports','/admin/inquiries','/admin/ownership','/admin/subculture']:['/creator','/creator/events','/creator/booths','/creator/reservations','/creator/pos','/creator/managed-exhibitors','/support','/creator/notices']);count++;
}
{
 const a=harness(),t=a.render(a.load('frontend/src/pages/CreatorPages.tsx').CreatorHomePage,{},true);
 const ns=nodes(t);assert.deepEqual(ns.filter(n=>n.props?.className==='creator-task-card').map(n=>n.props.to),['/creator/events','/creator/booths','/creator/reservations','/creator/pos']);count++;
 check(!ns.some(n=>n.props?.className==='metric-grid'),'no unbound metric placeholders');
 check(toHtml(t).includes('실제 결제는 별도로'),'POS distinction visible');
}
{
 const a=harness(),{SafeLink,ProductCard}=a.load('frontend/src/features/catalog/Shared.tsx');
 check(toHtml(SafeLink({url:'javascript:alert(1)'})).includes('잘못된 링크'),'unsafe external links still rejected');
 const p=structuredClone(require('../v9/fixtures.cjs').value.participants[0].sales.products[0]);
 for(const [state,label] of [['SOLD_OUT','품절 안내'],['CANCELED','판매 취소 안내'],['UNKNOWN','판매 상태 미확인']]){
  p.saleState=state;p.warnings=['중요한 원문 주의사항'];const html=toHtml(ProductCard({product:p,images:[]}));
  check(html.includes(label),state);check(html.includes('중요한 원문 주의사항'),state+' warnings preserved');
  check(html.includes('catalog-product-body'),state+' layout hook');
 }
}
const rgb=h=>h.match(/../g).map(x=>parseInt(x,16)/255);const lum=h=>rgb(h.replace('#','')).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
for(const [fg,bg,label] of [
 ['202c3b','ffffff','body'],['5f6b7a','ffffff','secondary text'],['5f6b7a','f6f7f9','secondary on canvas'],
 ['ffffff','b84532','subculture primary'],['ffffff','285faf','exhibitions primary'],['ffffff','176851','festivals primary'],
 ['ffffff','315b82','console primary'],['176344','eaf6ef','success'],['785008','fff3d9','warning'],['a9242c','fdecee','danger'],['235789','eaf2fc','information'],
 ['52697e','f6f7f9','page number'],['50687d','f4f6f9','console kicker'],['516b81','f4f6f9','process note'],['b84532','fff1eb','category accent'],['53606e','edf1f5','neutral chip']
 ]){
  const l=[lum(fg),lum(bg)],ratio=(Math.max(...l)+.05)/(Math.min(...l)+.05);
  check(ratio>=4.5,`${label}: contrast ${ratio.toFixed(2)}`);
 }
console.log(`PASS ${count} design/source/colour checks. Explicit JSX harness; selected colour pairs, not full WCAG certification.`);
