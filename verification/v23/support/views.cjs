/** Synthetic public fixtures. Real page modules; hooks/router/API are explicit doubles. */
const {runtime,jsx,component,nodes,text}=require('../../v22/support/runtime.cjs');
const event={name:'[가상] 취향 수집 마켓',region:'GYEONGGI',subcategory:'STATIONERY_GOODS',venueName:'가상 전시장 A홀',address:'경기도 고양시 예시로 100',description:'실제 행사 정보가 아닌 화면 검증용 자료입니다. 작은 브랜드의 문구와 일러스트 상품을 만나보세요.',admission:'입장 조건은 공식 안내에서 확인',occurrences:[{startDate:'2026-10-03',endDate:'2026-10-04',startTime:'10:00',endTime:'18:00'}],sources:[],warnings:[],operationStatus:{state:'SCHEDULED',note:'',checkedOn:'2026-09-18'},discoveryLinks:[]};
const participant={id:20,participant:{registrationName:'[가상] 달빛 문구',subjects:['일러스트','문구'],members:[],locations:[{code:'A-12',hall:'A홀',zone:'',status:'ASSIGNED',startDate:'2026-10-03',endDate:'2026-10-04'}],officialLinks:[]},sales:{summary:'화면 검증용 엽서와 스티커 안내',evidenceScope:'EVENT_SALE_CONFIRMED'},productRows:[]};
const value={id:1,event,participants:[participant],assets:[],banner:null,publishedAt:'2026-09-18T00:00:00Z'};
const cards=[{id:1,event,banner:null,participantCount:26},{id:2,event:{...event,name:'[가상] 작은 작가들의 온리전',subcategory:'ONLY_EVENT',region:'SEOUL',venueName:'가상 서울 행사장'},banner:null,participantCount:18},{id:3,event:{...event,name:'[가상] 종이와 색의 주말',subcategory:'STATIONERY_GOODS',venueName:'가상 수원 전시장'},banner:null,participantCount:40}];
const defaultLibrary={owner:'guest',loading:false,error:'',index:[],guest:[],publicVersion:1,version:0,refresh:async()=>{},refreshPublic(){},resolvePublic:async()=>[]};
function setup({search='',kind='discovery',routePath='',library=defaultLibrary,response={items:cards,total:3,page:0,size:20},error=null,loading=false}={}){
 let params=new URLSearchParams(search);const changes=[];const calls=[];
 const h=runtime({globals:{window:{location:{origin:'https://preview.invalid'},setInterval,clearInterval,scrollTo(){},matchMedia:()=>({matches:false}),confirm:()=>true},document:{visibilityState:'visible',addEventListener(){},removeEventListener(){}},requestAnimationFrame:fn=>0,cancelAnimationFrame(){},navigator:{clipboard:{writeText:async()=>{}}}},resolve:(name,file)=>{
  if(name==='react-router')return {Link:p=>jsx('a',{...p,href:p.to}),NavLink:p=>{const active=(routePath||(kind==='catalog'?'/discover/1':kind==='library'?'/library':'/discover')).startsWith(p.to);return jsx('a',{...p,href:p.to,'aria-current':active?'page':undefined,className:[p.className,active?'active':''].filter(Boolean).join(' ')})},Outlet:component('Outlet'),useLocation:()=>({pathname:routePath||(kind==='catalog'?'/discover/1':kind==='library'?'/library':'/discover'),search:params.toString()?'?'+params:'',state:null}),useSearchParams:()=>[params,(next,options)=>{params=new URLSearchParams(next);changes.push({params:params.toString(),options})}],useParams:()=>({eventId:'1'}),useNavigate:()=>()=>{}};
  if(name.endsWith('/LibraryProvider')||name==='./LibraryProvider')return {useLibrary:()=>library};
  if(name.endsWith('/useAuth'))return {useAuth:()=>({user:null,status:'anonymous',loading:false,loginUrl:'/login',logout:async()=>{},refresh:async()=>{}})};
  if(name.endsWith('/AuthStatusNotice'))return {AuthStatusNotice:()=>null};
  if(name.endsWith('/PageMetadata'))return {PageMetadata:()=>null,RouteMetadata:()=>null};
  if(name.endsWith('/useRemote'))return {useRemote:fn=>{calls.push(fn);return {data:kind==='library'?(calls.length%4===2?{items:[],total:0,groups:[]}:null):response,loading,error,reload:async()=>{}}}};
  if(name.endsWith('/ScrollMemory'))return {usePageScroll(){}};
  if(name.endsWith('/BestsellerCarousel'))return {BestsellerSection:()=>null};
  if(name.endsWith('/SaveButton'))return {SaveButton:()=>jsx('button',{type:'button',className:'btn secondary memory-save-button',children:'♡ 저장'})};
  if(name.endsWith('/ShareQr'))return {ShareQr:()=>jsx('button',{type:'button',className:'btn secondary',children:'공유·QR'})};
  if(name.endsWith('/ReportLink'))return {ReportLink:()=>jsx('a',{href:'#',children:'정보 수정 요청'})};
  if(name.endsWith('/OfflineDownloadPanel'))return {OfflineDownloadPanel:component('OfflineDownloadPanel')};
  if(name.endsWith('/BoothDrawer'))return {BoothDrawer:()=>null};
  if(name.endsWith('/InteractiveFloorPlans'))return {InteractiveFloorPlans:()=>jsx('p',{children:'배치도 영역 · 공개 자료가 있어야 표시됩니다.'})};
  if(name.endsWith('/catalog/api')||(name==='./api'&&file.includes('/catalog/')))return {publicCatalogApi:{browse:async()=>response}};
  if(name.endsWith('/Shared'))return {labels:{STATIONERY_GOODS:'문구·굿즈',ONLY_EVENT:'온리전'},scopes:{EVENT_SALE_CONFIRMED:'이번 행사 판매 안내'},SafeLink:p=>jsx('a',{href:p.url,children:p.children}),StoredImage:p=>jsx('img',{src:p.url,alt:p.alt}),LocationText:p=>jsx('span',{className:'visit-location',children:p.locations.map(l=>l.code).join(' · ')})};
 }});
 const path=kind==='catalog'?'frontend/src/features/catalog/CatalogPublicPage.tsx':kind==='layout'?'frontend/src/components/layout/PublicLayout.tsx':'frontend/src/features/discovery/DiscoveryPage.tsx';
 const module=h.load(path),fn=kind==='catalog'?module.CatalogEventDetail:kind==='layout'?module.PublicLayout:module.DiscoveryPage;
 const props=kind==='catalog'?{eventId:'1',value}:{};
 return {h,module,changes,calls,render:()=>h.render(fn,props),get params(){return params}};
}
module.exports={setup,event,participant,value,cards,defaultLibrary,nodes,text,jsx};
