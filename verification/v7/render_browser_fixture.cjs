/* Source-derived static fixture. Actual React rendering/state is tested separately, not claimed here. */
const fs=require('node:fs'),path=require('node:path')
const {harness,toHtml,root}=require('../v6/source_harness.cjs')
const ts=require('../v4/load_ts.cjs')()
const product={sourceEntryId:'p1',name:'[TEST] 달토끼 키링',summary:'가상 상품 · 실제 판매정보 아님',memberName:'테스트 작가',categories:['키링'],subjects:['달토끼'],evidenceScope:'EVENT_LISTED',price:null,saleState:'SOLD_OUT',productUrl:'https://fixture.test/product',sources:[],images:[],warnings:['가상 검증 데이터입니다.']}
const p={sourceEntryId:'circle1',registrationName:'[TEST] 첫 참가 부스',kind:'CIRCLE',members:[{name:'테스트작가',kind:'ARTIST',aliases:[],profileUrl:null}],locations:[{code:'B1',status:'ASSIGNED',hall:'가상 1홀',zone:null,startDate:'2026-10-10',endDate:'2026-10-10',floorPlanUrl:'https://fixture.test/map'}],subjects:['창작 굿즈'],officialLinks:['https://fixture.test/circle'],sources:[],images:[],warnings:[]}
const sales={summary:'가상 상품 판매정보를 보여주는 드로어입니다.',evidenceScope:'EVENT_LISTED',categories:['키링'],subjects:['창작 캐릭터'],salesMethod:null,sources:[],images:[],products:[product],warnings:[]}
const pr={id:1,participant:p,sales,productRows:[{id:1,data:product}]}
const event={name:'[TEST] v7 UI 회귀 확인',subcategory:'COMIC_DOUJIN',organizer:'테스트',edition:'test',region:'서울특별시',venueName:'가상 전시장',address:null,description:'이 화면은 실제 행사 정보가 아닌 검증용입니다.',admission:null,subjects:[],warnings:[],sources:[],banners:[],occurrences:[{startDate:'2026-10-10',endDate:'2026-10-10',startTime:null,endTime:null}],discoveryLinks:[]}
const asset={id:1,participantId:null,productId:null,type:'FLOOR_PLAN',url:'https://fixture.test/map.png',caption:'[TEST] 가상 배치도',credit:'테스트 이미지',attribution:'https://fixture.test/map'}
const participants=Array.from({length:80},(_,i)=>({...pr,id:i+1,participant:{...p,registrationName:i===0?p.registrationName:`[TEST] 참가 부스 ${i+1}`}}))
const data={id:1,event,participants,assets:[asset],banner:null,publishedAt:'2026-09-17T00:00:00Z'}
const app=harness({params:{eventId:'1'},remote:{data,loading:false,error:null}})
const publicPage=app.load('frontend/src/features/catalog/CatalogPublicPage.tsx').CatalogPublicDetail
let body=toHtml(app.render(publicPage,{},true))
const drawer=harness().load('frontend/src/features/catalog/BoothDrawer.tsx').BoothDrawer
const dialog=toHtml(drawer({row:pr,assets:[],trigger:null,close(){}}))
const headerApp=harness({location:{pathname:'/discover/1'}})
let header=toHtml(headerApp.render(headerApp.load('frontend/src/components/layout/PublicLayout.tsx').PublicLayout,{},true))
const logo='data:image/png;base64,'+fs.readFileSync(path.join(root,'frontend/public/assets/brand/logo.png')).toString('base64')
header=header.replaceAll('/assets/brand/logo.png',logo)
const js=ts.transpileModule(fs.readFileSync(path.join(root,'frontend/src/features/catalog/dialogLifecycle.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
const css=['frontend/src/styles/tokens.css','frontend/src/styles/global.css','frontend/src/features/discovery/discovery.css','frontend/src/features/catalog/catalog.css'].map(p=>fs.readFileSync(path.join(root,p),'utf8')).join('\n')
const script=`const exports={};${js}\nlet cleanup=null;document.querySelectorAll('.catalog-booth-card').forEach(button=>{button.addEventListener('click',()=>{const node=document.getElementById('drawer-template').content.cloneNode(true);document.body.appendChild(node);const dialog=document.querySelector('dialog');cleanup=exports.openCatalogDialog(dialog,dialog.querySelector('h2'),button);const close=()=>{cleanup();dialog.remove();cleanup=null;};dialog.querySelector('button').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close()});});});`
fs.writeFileSync(path.join(__dirname,'results/browser-fixture.html'),`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>v7 source fixture · not live React</title><style>${css}</style><body><p style="padding:8px;background:#eee">[TEST] 정적 소스 출력 + 실제 dialog lifecycle · React E2E 아님</p>${header}${body}<template id="drawer-template">${dialog}</template><script>${script}</script></body></html>`)
console.log('Generated source fixture for native dialog/browser accessibility checks (not React E2E).')
