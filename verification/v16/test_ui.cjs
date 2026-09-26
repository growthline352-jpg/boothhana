/* Real TSX functions; explicit hook/router doubles, not browser React E2E. */
const assert=require('node:assert/strict'),{harness,nodes,toHtml}=require('../v10/source_harness.cjs');let checks=0;const ok=x=>{assert.ok(x);checks++},eq=(a,b)=>{assert.deepEqual(a,b);checks++};
const event={name:'[TEST] 가상 문구행사',subcategory:'STATIONERY_GOODS',organizer:'[TEST]',edition:'1',region:'SEOUL',venueName:'[TEST] 장소',address:null,description:'가상 설명',admission:'확인 필요',subjects:[],occurrences:[{startDate:'2026-10-01',endDate:'2026-10-05',startTime:null,endTime:null}],sources:[],images:[],warnings:[],discoveryLinks:[],operationStatus:{state:'SCHEDULED',note:'테스트',sourceUrl:'https://example.com',checkedOn:'2026-09-18'}};
const target={type:'PRODUCT',eventId:1,id:3,participantId:2},memory={title:'[TEST] 식물 키링',eventName:event.name,participantName:'[TEST] 작은숲',summary:'가상 초록 소품',tags:['식물']};
const product={identity:null,sourceEntryId:'p3',name:memory.title,summary:memory.summary,memberName:null,categories:['키링'],subjects:['식물'],evidenceScope:'EVENT_SALE_CONFIRMED',price:{amount:'3000',currency:'KRW',checkedOn:'2026-09-01',note:null},saleState:'ON_SALE',productUrl:'https://example.com/p3',sources:[],images:[],warnings:[]};
const current={memory,operationState:'SCHEDULED',notice:'',venue:event.venueName,occurrences:event.occurrences,locations:[],evidenceScope:product.evidenceScope,price:product.price,saleState:product.saleState,links:[],publishedAt:'2026-09-18T00:00:00Z',warnings:[],verification:{state:'NOT_RECONFIRMED',lastSeenAt:'2026-09-01T00:00:00Z'}};
const entry={id:'11111111-1111-4111-8111-111111111111',target,revision:0,savedAt:'2026-09-18T00:00:00Z',updatedAt:'2026-09-18T00:00:00Z',day:'',hall:'',note:'PRIVATE TEST NOTE',visitedDays:[],available:true,saved:memory,current,image:null,changed:false,lastOpenedAt:null};
for(const [today,period,from,to,dates,expected] of [
 ['2026-09-18','custom','2026-10-03','2026-10-04',event.occurrences,'2026-10-03'],
 ['2026-10-03','upcoming','2026-10-03',undefined,event.occurrences,'2026-10-03'],
 ['2026-09-18','custom','2026-10-04','2026-10-06',[{startDate:'2026-10-01',endDate:'2026-10-02'},{startDate:'2026-10-05',endDate:'2026-10-06'}],'2026-10-05'],
 ['2026-09-18','all',undefined,undefined,event.occurrences,'2026-10-01'],
]){const h=harness(),m=h.load('frontend/src/features/discovery/DiscoveryPage.tsx'),ns=nodes(h.render(m.DiscoveryEventCard,{row:{id:1,event:{...event,occurrences:dates},participantCount:2,banner:null},today,returnTo:'/discover',period,from,to},true));const link=ns.find(n=>n.props?.className==='discovery-event-link'),save=ns.find(n=>n.type?.name==='SaveButton');eq(new URLSearchParams(link.props.to.split('?')[1]).get('day'),expected);eq(save.props.day,expected);}
{
const lib={owner:'member:1',index:[entry],guest:[],version:0,publicVersion:0,refreshPublic:()=>{},resolvePublic:async()=>[],loading:false,error:'',refresh:async()=>{}};
const h=harness({libraryApi:{activity:async()=>{}},location:{pathname:'/library',search:'?page=2&q=%EC%8B%9D%EB%AC%BC&group=event'},library:lib,auth:{status:'authenticated',user:{id:1,displayName:'[TEST]',permissions:['FAN']},loading:false,loginUrl:'/api/auth/login'},remote:{loading:false,error:null,data:{items:[entry],page:2,size:24,total:60,groups:[{eventId:1,name:event.name,count:60}]}}});
const m=h.load('frontend/src/features/library/LibraryPage.tsx');let n=nodes(h.render(m.LibraryPage));n.find(n=>n.type?.name==='MemoryCard').props.open(entry,{});eq(new URLSearchParams(h.env.location.search).get('page'),'2');h.env.remote.data={...h.env.remote.data,...entry};n=nodes(h.render(m.LibraryPage));n.find(n=>n.type?.name==='MemoryEditor').props.close();let p=new URLSearchParams(h.env.location.search);eq(p.get('page'),'2');eq(p.get('q'),'식물');eq(p.get('group'),'event');eq(p.has('item'),false);
}
{
 const h=harness({library:{owner:'member:1',index:[entry],guest:[],version:0,loading:false,error:''}}),m=h.load('frontend/src/features/library/LibraryPage.tsx');
 const card=toHtml(h.render(m.MemoryCard,{entry,guest:false,open:()=>{}},true)),editor=toHtml(h.render(m.MemoryEditor,{entry,guest:false,trigger:null,close:()=>{}},true));
 for(const html of [card,editor]){ok(html.includes('최근 수집에서 재확인되지 않음'));ok(html.includes('현재 판매 여부 확인 필요'));ok(html.includes('마지막 상품 확인'));ok(html.includes('판매 중으로 안내됨'));}
 for(const saleState of ['SOLD_OUT','CANCELED']){const html=toHtml(h.render(m.MemoryCard,{entry:{...entry,current:{...current,saleState}},guest:false,open:()=>{}},true));ok(html.includes('최근 수집에서 재확인되지 않음'));ok(!html.includes('판매 중으로 안내됨'));}
 const hidden=toHtml(h.render(m.MemoryCard,{entry:{...entry,available:false,current:null,saved:null,image:null},guest:false,open:()=>{}},true));ok(!hidden.includes(memory.title));ok(!hidden.includes('마지막 상품 확인'));ok(hidden.includes('PRIVATE TEST NOTE'));
 const verify=h.load('frontend/src/features/library/VerificationNotice.tsx');let html=toHtml(h.render(verify.VerificationNotice,{verification:{state:'CONFIRMED_CURRENT',lastSeenAt:'2026-09-18T00:00:00Z'}},true));ok(!html.includes('재확인되지 않음'));ok(html.includes('마지막 상품 확인'));html=toHtml(h.render(verify.VerificationNotice,{verification:null},true));ok(html.includes('재확인 이력 없음'));
}
{
 let retry=0;const h=harness({auth:{status:'error',refresh:async()=>retry++,user:null},library:{owner:'error',loading:false,index:[],guest:[],version:0,error:'test'}}),m=h.load('frontend/src/features/library/SaveButton.tsx');const n=nodes(h.render(m.SaveButton,{target},true));ok(n.find(x=>x.props?.className?.includes('memory-save-button'))?.props.disabled);const button=n.find(x=>x.type==='button'&&x.props.children==='계정 다시 확인');ok(button);button.props.onClick();eq(retry,1);
 const p=h.load('frontend/src/features/library/LibraryPage.tsx');const html=toHtml(h.render(p.LibraryPage,{},true));ok(html.includes('기기 저장으로 바꾸지 않았어요'));ok(!html.includes('PRIVATE TEST NOTE'));ok(html.includes('계정 다시 확인'));
}
console.log(`PASS ${checks} actual source JSX/handler conditions. Mock React/Router, not full browser E2E.`);
