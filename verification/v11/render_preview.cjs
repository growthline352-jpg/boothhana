/* Actual source markup/CSS, fake sample goods. Static DOM adapter, NOT React E2E. */
const fs=require('node:fs'),path=require('node:path');
const {harness,toHtml,nodes,root}=require('../v10/source_harness.cjs');
const {feed:baseFeed}=require('./fixtures.cjs');const {plan,value,date}=require('../v9/fixtures.cjs');
const folder=path.join(root,'preview/v11');fs.mkdirSync(folder,{recursive:true});
const assets=['moon-rabbit-keychains','pixel-cat-stickers','star-courier-posters','summer-cat-pouch'];
const image=n=>'data:image/webp;base64,'+fs.readFileSync(path.join(root,'preview/v10/assets/'+n+'.webp')).toString('base64');
const logo='data:image/png;base64,'+fs.readFileSync(path.join(root,'preview/v10/assets/logo.png')).toString('base64');
const css=['styles/tokens.css','styles/global.css','features/catalog/catalog.css','features/collection/collection.css','features/discovery/discovery.css','features/floorplan/floorplan.css','features/visit/visit.css','styles/polish.css','features/goods/goods.css'].map(f=>fs.readFileSync(path.join(root,'frontend/src',f),'utf8')).join('\n');
function expand(app,node){
 if(node==null||typeof node!=='object')return node;if(Array.isArray(node))return node.map(n=>expand(app,n));
 if(typeof node.type==='function')return expand(app,app.render(node.type,node.props,true));
 let children=expand(app,node.props.children);
 if(node.type==='select')children=[children].flat(Infinity).map(c=>c?.type==='option'?{...c,props:{...c.props,selected:String(c.props.value)===String(node.props.value)}}:c);
 return {...node,props:{...node.props,children}};
}
function save(name,markup,extra=''){
 markup=markup.replaceAll('/assets/brand/logo.png',logo);
 fs.writeFileSync(path.join(folder,name+'.html'),`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>부스하나 v11 · 가상 데이터 미리보기</title><style>${css}\n.demo-note{padding:10px 20px;background:#24384e;color:white;font:13px/1.6 system-ui}.demo-note a{color:white;margin-left:14px}body{margin:0}.goods-picture img{box-sizing:border-box}</style></head><body><div class="demo-note">가상 상품·가상 순위의 디자인 시안입니다. 실제 판매 데이터가 아니며 React/API는 연결되지 않았습니다.<a href="home.html">메인</a><a href="admin.html">노출 설정</a><a href="map.html">전체화면 지도</a></div>${markup}<script>
// Static preview only. Mirrors the manual carousel controls; actual source handlers have isolated tests.
for(const s of document.querySelectorAll('.goods-section')){const rail=s.querySelector('ol');if(!rail)continue;const buttons=s.querySelectorAll('.goods-controls button');const update=()=>{buttons[0].disabled=rail.scrollLeft<=2;buttons[1].disabled=rail.scrollLeft+rail.clientWidth>=rail.scrollWidth-2;};buttons[0].onclick=()=>rail.scrollBy({left:-rail.clientWidth*.88,behavior:'auto'});buttons[1].onclick=()=>rail.scrollBy({left:rail.clientWidth*.88,behavior:'auto'});rail.addEventListener('scroll',update);window.addEventListener('resize',update);rail.onkeydown=e=>{if(e.target!==rail)return;if(['ArrowRight','ArrowLeft'].includes(e.key)){e.preventDefault();rail.scrollBy({left:(e.key==='ArrowRight'?1:-1)*rail.clientWidth*.88,behavior:'auto'})}};update()}
document.querySelectorAll('a[href^="/products/"]').forEach(a=>a.onclick=e=>{e.preventDefault();alert('디자인 시안입니다. 운영 화면에서는 실제 상품 안내 페이지로 이동합니다.')});
${extra}</script></body></html>`);
}
const app=harness();const feed=structuredClone(baseFeed);feed.items.forEach((item,i)=>item.imageUrl=i===7?null:image(assets[i%4]));
const goods=expand(app,app.render(app.load('frontend/src/features/goods/BestsellerCarousel.tsx').GoodsCarousel,{feed},true));
// Use the existing source-based home scaffold. Replace its empty goods panel with the new actual carousel markup.
let home=fs.readFileSync(path.join(root,'preview/v10/home.html'),'utf8');const main=home.match(/<main[^>]*>([\s\S]*?)<\/main>/)[1];
const boundary=main.indexOf('<section class="discovery-container discovery-feed"');
let combined=boundary<0?toHtml(goods)+main:main.slice(0,boundary)+toHtml(goods)+main.slice(boundary);
app.env.outlet=()=>app.jsx('div',{children:null});const shell=expand(app,app.render(app.load('frontend/src/components/layout/PublicLayout.tsx').PublicLayout,{},true));
let shellHtml=toHtml(shell).replace(/(<main[^>]*>)[\s\S]*?(<\/main>)/,'$1'+combined+'$2');save('home',shellHtml);
const rows=feed.items.slice(0,5).map((x,i)=>({product_id:x.productId,event_product_id:x.eventProductId,name:x.name,price:x.price,booth_name:x.boothName,event_name:x.eventName,units:[73,51,42,34,12][i],category:'SUBCULTURE',enabled:i<4,revision:1}));
const admin=harness({auth:{loading:false,user:{id:1,displayName:'[가상] 운영자',permissions:['ADMIN','FAN','CREATOR']}},remote:{loading:false,error:null,data:{items:rows,page:0,size:20,hasNext:false},reload:async()=>{}}});
const adminBody=expand(admin,admin.render(admin.load('frontend/src/features/goods/GoodsAdminPage.tsx').GoodsAdminPage,{},true));admin.env.outlet=()=>adminBody;save('admin',toHtml(expand(admin,admin.render(admin.load('frontend/src/components/layout/ConsoleLayout.tsx').ConsoleLayout,{role:'ADMIN'},true))));
const m=harness();const mapTree=m.render(m.load('frontend/src/features/floorplan/InteractiveFloorPlans.tsx').MapView,{plan,participants:value.participants,day:date,hall:'1관',focusParticipantId:1,onOpen(){},eventId:'10',assets:[]},true);
const canvasNode=nodes(mapTree).find(n=>n.type?.name==='PlanCanvas');
const c=harness();const Canvas=c.load('frontend/src/features/floorplan/PlanCanvas.tsx').PlanCanvas;
let selected=c.render(Canvas,canvasNode.props,true);nodes(selected).find(n=>n.type==='button'&&n.props.children==='배치도 전체화면').props.onClick();selected=c.render(Canvas,canvasNode.props);
const mapHtml=toHtml(expand(c,selected));
const content=m.render(m.load('frontend/src/features/catalog/BoothContent.tsx').BoothContent,{row:value.participants[0],assets:[],day:date,hall:'1관'},true);
const detailHtml='<section class="floorplan-full-details" hidden><div class="floorplan-details-heading"><button class="btn secondary" data-demo-back>← 같은 지도 위치로 돌아가기</button><h2 tabindex="-1">'+value.participants[0].participant.registrationName+'</h2></div>'+toHtml(expand(m,content))+'</section>';
save('map',mapHtml.replace('</dialog>',detailHtml+'</dialog>'),`const d=document.querySelector('dialog');d.showModal();const map=d.querySelector('.floorplan-full-map'),detail=d.querySelector('.floorplan-full-details');let trigger;d.querySelectorAll('[data-floorplan-details]').forEach(b=>b.onclick=()=>{trigger=b;map.style.visibility='hidden';map.inert=true;map.setAttribute('aria-hidden','true');detail.hidden=false;detail.querySelector('h2').focus()});const back=()=>{detail.hidden=true;map.style.visibility='';map.inert=false;map.removeAttribute('aria-hidden');trigger?.focus()};d.querySelector('[data-demo-back]').onclick=back;d.oncancel=e=>{if(!detail.hidden){e.preventDefault();back()}};`);
console.log('Wrote three source-based static demo pages; sample ranking is fictitious.');
