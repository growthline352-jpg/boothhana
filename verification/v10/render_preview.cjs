/* Actual source JSX/CSS in an explicit hook harness. No live React, API or real events. */
const fs=require('node:fs'),path=require('node:path');
const {harness,toHtml,nodes,root}=require('./source_harness.cjs');
const {value:base,plan,date}=require('../v9/fixtures.cjs');
const folder=path.join(root,'preview/v10');fs.mkdirSync(folder,{recursive:true});
const cssFiles=['styles/tokens.css','styles/global.css','features/catalog/catalog.css','features/collection/collection.css','features/discovery/discovery.css','features/floorplan/floorplan.css','features/visit/visit.css','styles/polish.css'];
const css=cssFiles.map(f=>fs.readFileSync(path.join(root,'frontend/src',f),'utf8')).join('\n');
const value=structuredClone(base);
value.event.name='[예시] 작은 창작 마켓';
value.event.admission='현장 관람 · 입장 조건은 공식 안내를 확인해 주세요.';
const address=(name)=>'https://preview.boothhana.test/assets/'+name;
const previewImage=(name)=>{const n=name==='logo.png'?'logo.png':name.replace('.png','.webp');return 'data:image/'+(n.endsWith('png')?'png':'webp')+';base64,'+fs.readFileSync(path.join(folder,'assets',n)).toString('base64')};
const assets=['moon-rabbit-keychains.png','pixel-cat-stickers.png','star-courier-posters.png','summer-cat-pouch.png'];
value.assets=value.participants.slice(0,4).map((p,i)=>({id:100+i,type:'BOOTH_CUT',participantId:p.id,productId:null,url:address(assets[i]),caption:'화면 확인용 예시 이미지',credit:'저장소 예시 자산',attribution:'https://example.com/design-fixture'}));
const rows=['[예시] 작은 창작 마켓','[예시] 인형과 만나는 주말','[예시] 별빛 캐릭터 온리전'].map((name,i)=>({id:10+i,event:{...value.event,name,subcategory:['STATIONERY_GOODS','DOLL','ONLY_EVENT'][i],occurrences:[{startDate:['2026-10-10','2026-10-17','2026-10-24'][i],endDate:['2026-10-11','2026-10-18','2026-10-24'][i],startTime:'11:00',endTime:'17:00'}]},participantCount:[6,4,8][i],publishedAt:'2026-09-17T00:00:00Z',banner:i===1?null:{id:30+i,url:address(assets[i]),caption:'가상 행사 시안용 이미지',credit:'저장소 예시 자산',attribution:'https://example.com/design-fixture'}}));
function expand(app,node){
 if(node==null||typeof node!=='object')return node;
 if(Array.isArray(node))return node.map(n=>expand(app,n));
 if(typeof node.type==='function')return expand(app,app.render(node.type,node.props,true));
 let children=expand(app,node.props.children);
 if(node.type==='select'&&node.props.value!==undefined)children=[children].flat(Infinity).map(c=>c?.type==='option'?{...c,props:{...c.props,selected:String(c.props.value)===String(node.props.value)}}:c);
 return {...node,props:{...node.props,children}};
}
function scaffold(app,content,consoleRole){
 app.env.outlet=()=>content;
 return expand(app,app.render(app.load(consoleRole?'frontend/src/components/layout/ConsoleLayout.tsx':'frontend/src/components/layout/PublicLayout.tsx')[consoleRole?'ConsoleLayout':'PublicLayout'],consoleRole?{role:consoleRole}:{},true));
}
function save(name,tree){
 let markup=toHtml(tree).replaceAll('/assets/brand/logo.png',previewImage('logo.png'));
 for(const asset of assets)markup=markup.replaceAll(address(asset),previewImage(asset));
 const demoLinks=[['home','행사 찾기'],['booths','행사 상세'],['map','배치도'],['drawer','판매정보'],['admin','관리자'],['creator','크리에이터']].map(([id,t])=>`<a href="${id}.html">${t}</a>`).join('');
 const script=`
 /* Preview links/native dialog only: React handlers are NOT running here. */
 const links={subculture:'home',exhibitions:'exhibitions',festivals:'festivals'};
 document.querySelectorAll('.discovery-category-link').forEach(a=>{const c=new URL(a.getAttribute('href'), 'https://preview.boothhana.test').searchParams.get('category');a.href=(links[c]||'home')+'.html'});
 document.querySelectorAll('.discovery-brand,.discovery-footer-brand').forEach(a=>a.href='home.html');
 document.querySelectorAll('.discovery-event-link').forEach(a=>a.href='booths.html');
 document.querySelectorAll('.visit-view-switch button').forEach((b,i)=>b.onclick=()=>location.href=['booths','map','info'][i]+'.html');
 const buttons=[...document.querySelectorAll('button')];
 buttons.filter(b=>b.textContent==='상품 보기').forEach(b=>b.onclick=()=>location.href='drawer.html');
 buttons.filter(b=>b.textContent==='지도에서 보기').forEach(b=>b.onclick=()=>location.href='map.html');
 ${name==='drawer'?"const d=document.querySelector('.catalog-drawer');d.showModal();d.querySelector('h2').focus();d.querySelector('button[aria-label=\"판매정보 닫기\"]').onclick=()=>d.close();":''}
 document.querySelectorAll('.side-nav a,.mobile-role-nav a').forEach(a=>{if(a.getAttribute('href')===${JSON.stringify(name==='admin'?'/admin/subculture':name==='creator'?'/creator':'/creator/event-booths/1/products')}){a.classList.add('active');a.setAttribute('aria-current','page')}});
 `;
 fs.writeFileSync(path.join(folder,name+'.html'),`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>부스하나 v10 · 디자인 확인</title><style>${css}\n.preview-bar{padding:8px 16px;background:#233d56;color:#fff;font:12px/1.6 var(--font-ui);display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}.preview-bar nav{display:flex;gap:14px;flex-wrap:wrap}.preview-bar a{color:#fff;text-decoration:underline;text-underline-offset:3px;min-height:24px;display:inline-flex;align-items:center}</style></head><body><div class="preview-bar"><span>디자인 확인용 가상 데이터 · 실제 React 앱·운영 서비스가 아닌 정적 미리보기</span><nav>${demoLinks}</nav></div>${markup}<script>${script}</script></body></html>`);
}
for(const name of ['home','exhibitions','festivals','empty','error']){
 const category=['exhibitions','festivals'].includes(name)?name:'subculture';
 const app=harness({location:{pathname:'/discover',search:'?category='+category},remote:{loading:false,error:name==='error'?new Error('예시 연결 오류'):null,data:{items:name==='empty'?[]:rows,page:0,size:20,total:name==='empty'?0:3},reload:async()=>{}}});
 save(name,scaffold(app,app.render(app.load('frontend/src/features/discovery/DiscoveryPage.tsx').DiscoveryPage,{},true)));
}
for(const name of ['booths','map','drawer','info']){
 const app=harness({location:{pathname:'/discover/10',search:`?day=${date}&hall=1관&view=${name==='drawer'?'booths':name}${name==='drawer'?'&booth=1':''}`},floorplanRemote:{loading:false,error:null,data:{plans:[plan],managedAssetIds:[]},reload:async()=>{}}});
 save(name,scaffold(app,app.render(app.load('frontend/src/features/catalog/CatalogPublicPage.tsx').CatalogEventDetail,{eventId:'10',value},true)));
}
const adminRows=rows.map((r,i)=>({id:r.id,name:r.event.name,startDate:r.event.occurrences[0].startDate,subcategory:r.event.subcategory,reviewState:['REVIEWED','PENDING','PENDING'][i],participantCount:[24,8,18][i],salesCount:[16,3,11][i],storedImageCount:[12,2,6][i],published:i===0}));
{
 const app=harness({auth:{user:{id:1,displayName:'운영자',permissions:['FAN','CREATOR','ADMIN']},loading:false},location:{pathname:'/admin/subculture',search:''},remote:{loading:false,error:null,data:{items:adminRows,total:3,page:0,size:20},reload:async()=>{}}});
 save('admin',scaffold(app,app.render(app.load('frontend/src/features/catalog/CatalogAdminPage.tsx').CatalogAdminPage,{},true),'ADMIN'));
}
{
 const app=harness({auth:{user:{id:1,displayName:'달토끼공방',permissions:['FAN','CREATOR']},loading:false},location:{pathname:'/creator',search:''}});
 save('creator',scaffold(app,app.render(app.load('frontend/src/pages/CreatorPages.tsx').CreatorHomePage,{},true),'CREATOR'));
}
{
 const products=[{id:1,name:'달토끼 아크릴 키링',description:'예시 상품 · 화면 확인용',price:8000,stockQuantity:30,stockMode:'FINITE',reservationEnabled:true,isPublic:true,soldOut:false},{id:2,name:'별빛 스티커 팩',description:'가상의 가격과 재고입니다.',price:3500,stockQuantity:0,stockMode:'FINITE',reservationEnabled:false,isPublic:true,soldOut:true}];
 const app=harness({params:{eventBoothId:'1'},auth:{user:{id:1,displayName:'달토끼공방',permissions:['FAN','CREATOR']},loading:false},location:{pathname:'/creator/event-booths/1/products',search:''},remote:{loading:false,error:null,data:products,reload:async()=>{}}});
 save('products',scaffold(app,app.render(app.load('frontend/src/features/creator/CreatorProductsPage.tsx').CreatorProductsPage,{},true),'CREATOR'));
}
{
 const app=harness({params:{eventId:'1'},auth:{user:{id:1,displayName:'운영자',permissions:['FAN','CREATOR','ADMIN']},loading:false},location:{pathname:'/admin/events/1',search:''},remote:{loading:false,error:null,data:{id:1,name:'[예시] 작은 창작 마켓',venue:'가상 전시장',description:'화면 확인용 가상 행사입니다.',startAt:'2026-10-11T02:00:00Z',endAt:'2026-10-11T08:00:00Z',status:'DRAFT'},reload:async()=>{}}});
 save('event-form',scaffold(app,app.render(app.load('frontend/src/features/admin/AdminEventFormPage.tsx').AdminEventFormPage,{},true),'ADMIN'));
}
{
 const app=harness({params:{eventBoothId:'1'},auth:{user:{id:1,displayName:'달토끼공방',permissions:['FAN','CREATOR']},loading:false},location:{pathname:'/creator/event-booths/1/products',search:''},remote:{loading:false,error:null,data:[],reload:async()=>{}}});
 const child=app.render(app.load('frontend/src/features/creator/CreatorProductsPage.tsx').CreatorProductsPage,{},true);
 const initial=app.render(child.type,child.props,true);
 nodes(nodes(initial).find(n=>typeof n.type==='function'&&n.type.name==='PageHeader').props.actions).find(n=>n.type==='button'&&toHtml(n.props.children)==='상품 등록').props.onClick();
 const content=expand(app,app.render(child.type,child.props));
 save('product-form',scaffold(app,content,'CREATOR'));
}
console.log('14 source-based static pages generated. Mock hooks/API, fabricated data; no React E2E.');
