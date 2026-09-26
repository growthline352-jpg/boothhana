/** Static mock preview from actual source markup and CSS. Never deploy as a live catalog. */
const fs=require('node:fs'),path=require('node:path');const {harness,toHtml,root}=require('./source_harness.cjs')
const out=process.argv[2]||path.join(root,'preview/category-preview.html');fs.mkdirSync(path.dirname(out),{recursive:true})
const event=(id,name,type,venue,dates,description,count)=>({id,event:{name,subcategory:type,venueName:venue,address:null,description,region:'서울특별시',organizer:'가상 주최자',admission:null,subjects:[],warnings:[],sources:[],banners:[],occurrences:dates.map(([startDate,endDate])=>({startDate,endDate,startTime:null,endTime:null}))},participantCount:count,banner:null})
const rows=[
 event(90001,'[예시] 크리에이터 굿즈 마켓','COMIC_DOUJIN','가상 서울 전시장 A홀',[['2026-10-03','2026-10-04']],'창작 굿즈와 서클을 소개하는 화면 예시입니다. 실제 행사 데이터가 아닙니다.',24),
 event(90002,'[예시] 작은 인형들의 하루','DOLL','가상 문화공간 1관',[['2026-10-10','2026-10-10']],'인형과 미니어처를 다루는 참가 부스 카드 예시입니다. 실제 개최 정보가 아닙니다.',9),
 event(90003,'[예시] 캐릭터 생일 라운지','BIRTHDAY_CAFE','가상 서울 카페',[['2026-10-10','2026-10-11'],['2026-10-13','2026-10-13']],'휴무일을 포함하지 않는 운영일 표시 예시입니다. 실제 카페 행사 정보가 아닙니다.',1)
]
let templates=''
for(const key of ['subculture','exhibitions','festivals']){
 const h=harness({location:{search:'?category='+key},remote:{loading:false,error:null,data:{items:key==='subculture'?rows:[],total:key==='subculture'?rows.length:0,page:0,size:20},reload:async()=>{}}})
 h.env.outlet=()=>h.load('frontend/src/features/discovery/DiscoveryPage.tsx').DiscoveryPage()
 const layout=h.load('frontend/src/components/layout/PublicLayout.tsx').PublicLayout
 let html=toHtml(h.render(layout,{},true))
 const logo='data:image/png;base64,'+fs.readFileSync(path.join(root,'frontend/public/assets/brand/logo.png')).toString('base64')
 html=html.replaceAll('/assets/brand/logo.png',logo)
 templates+=`<template id="${key}">${html}</template>`
}
const css=['frontend/src/styles/tokens.css','frontend/src/styles/global.css','frontend/src/features/catalog/catalog.css','frontend/src/features/discovery/discovery.css'].map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n')
const script=`
const allowed=['subculture','exhibitions','festivals'];
function draw(){const key=allowed.includes(location.hash.slice(1))?location.hash.slice(1):'subculture';document.getElementById('app').replaceChildren(document.getElementById(key).content.cloneNode(true));document.title='[가상 미리보기] '+({subculture:'서브컬처',exhibitions:'박람회',festivals:'축제'}[key])+' | 부스하나';bind();}
function notice(text){const el=document.getElementById('preview-notice');el.textContent=text;el.hidden=false;setTimeout(()=>el.hidden=true,3500);}
function bind(){document.querySelectorAll('#app a').forEach(a=>{a.addEventListener('click',e=>{const raw=a.getAttribute('href')||'';if(raw==='#public-main')return;e.preventDefault();if(raw.startsWith('/discover?')){const cat=new URL(raw,'https://example.test').searchParams.get('category');location.hash=allowed.includes(cat)?cat:'subculture';window.scrollTo(0,0);}else if(raw==='/'){location.hash='subculture';window.scrollTo(0,0);}else{notice('화면 확인용 예시입니다. 로그인·상세·예약은 전체 소스를 실행해 확인하세요.');}})});
 document.querySelectorAll('#app form').forEach(f=>f.addEventListener('submit',e=>{e.preventDefault();notice('검색은 전체 소스에서 실제 공개 데이터 API와 연결됩니다.');}));
 document.querySelectorAll('#app button:not(:disabled)').forEach(b=>b.addEventListener('click',()=>{if(b.type!=='submit')notice('이 HTML은 탭 전환과 반응형 확인용입니다. 필터는 앱 실행 시 동작합니다.');}));
}
window.addEventListener('hashchange',draw);document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('details[open]').forEach(d=>d.open=false)});draw();`
fs.writeFileSync(out,`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>부스하나 카테고리 미리보기</title><style>${css}\n.preview-ribbon{padding:7px 18px;background:#273345;color:#e3e9f0;text-align:center;font:11px/1.6 sans-serif}.preview-ribbon strong{color:white;margin-right:10px}.preview-notice{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);max-width:calc(100% - 32px);width:max-content;background:#233144;color:white;border-radius:8px;padding:12px 20px;z-index:99;font:12px/1.7 sans-serif;box-shadow:0 4px 30px #0003}.preview-notice[hidden]{display:none}</style></head><body><div class="preview-ribbon"><strong>DESIGN PREVIEW</strong>가상 데이터 · 실제 행사/DB 아님 · 헤더 3개 탭을 눌러보세요</div><div id="app"></div><div id="preview-notice" class="preview-notice" role="status" hidden></div>${templates}<script>${script}</script></body></html>`)
console.log('Generated source-derived static mock preview:',out)
