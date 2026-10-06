const {harness,nodes,toHtml}=require('../v10/source_harness.cjs'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');let n=0
const ok=(x,m)=>{assert.ok(x,m);n++}
const t={type:'PRODUCT',eventId:1,id:3,participantId:2},memory={title:'[TEST] 초록 식물 키링',eventName:'[TEST] 문구 행사',participantName:'[TEST] 작은숲 공방',summary:'잎 모양의 작은 키링',tags:['식물','선물']}
const current={memory,operationState:'SCHEDULED',notice:'',venue:'서울 테스트 장소',occurrences:[{startDate:'2026-09-16',endDate:'2026-09-16',startTime:'11:00',endTime:'17:00'}],locations:[{code:'B1',status:'ASSIGNED',hall:'1관',zone:null,startDate:'2026-09-16',endDate:'2026-09-16',floorPlanUrl:null}],evidenceScope:'EVENT_LISTED',price:null,saleState:'PLANNED',links:[],publishedAt:'2026-09-16T00:00:00Z'}
const entry={id:'11111111-1111-4111-8111-111111111111',target:t,revision:0,savedAt:'2026-09-16T00:00:00Z',updatedAt:'2026-09-16T00:00:00Z',day:'2026-09-16',hall:'1관',note:'내 기억 PRIVATE_NOTE_123',visitedDays:[],saved:memory,current,available:true,image:null,changed:false,lastOpenedAt:null}
const library={owner:'member:1',index:[entry],guest:[],version:0,loading:false,error:'',refresh:async()=>{}}
const h=harness({location:{pathname:'/library',search:''},library,auth:{user:{id:1,displayName:'[TEST] 이용자',permissions:['FAN']},loading:false,loginUrl:'/api/auth/login'},remote:{loading:false,error:null,data:{items:[entry],page:0,size:24,total:1,groups:[{eventId:1,name:memory.eventName,count:1}]}}})
const mod=h.load('frontend/src/features/library/LibraryPage.tsx'),tree=h.render(mod.LibraryPage),html=toHtml(tree)
for(const word of ['내 보관함','내 기억','메모·방문 기록','지도에서 보기','업체·제품·행사·내 메모로 검색','관심 기록'])ok(html.includes(word),word)
ok(!html.includes('type="hidden"'));ok(!html.includes('mailto:'))
const links=nodes(h.render(mod.MemoryCard,{entry,guest:false,open:()=>{}})).filter(x=>x.props?.to).map(x=>x.props.to)
for(const link of links){ok(!link.includes('PRIVATE_NOTE'));if(!link.startsWith('/library?'))ok(!link.includes(entry.id))}
// A private in-app link can focus the saved entry; public map/share links must
// still contain only public target ids and never the owner's memory id or note.
ok(links.some(link=>link.startsWith('/library?')&&new URLSearchParams(link.split('?')[1]).get('focus')===entry.id))
const hidden=toHtml(h.render(mod.MemoryCard,{entry:{...entry,available:false,current:null,saved:null,image:null},guest:false,open:()=>{}},true))
ok(hidden.includes('현재 공개되지 않는 정보'));ok(hidden.includes('PRIVATE_NOTE_123'));ok(!hidden.includes('초록 식물 키링'));ok(!hidden.includes('지도에서 보기'))
const draft=harness({library:{...library,owner:'guest',index:[],guest:[]},auth:{user:null,loading:false,loginUrl:'/api/auth/login'},remote:{loading:false,error:null,data:{items:[],page:0,size:24,total:0,groups:[]}}});const guestHtml=toHtml(draft.render(draft.load('frontend/src/features/library/LibraryPage.tsx').LibraryPage))
ok(guestHtml.includes('이 기기에 임시 저장'));ok(guestHtml.includes('90일'));ok(guestHtml.includes('로그인하고 계정에 보관'))
const saveMod=h.load('frontend/src/features/library/SaveButton.tsx'),saveTree=h.render(saveMod.SaveButton,{target:t,compact:true},true)
ok(nodes(saveTree).some(x=>x.props?.['aria-pressed']===true));ok(nodes(saveTree).some(x=>x.props?.['aria-label']==='보관함에서 저장 해제'));ok(!toHtml(saveTree).includes('저장됨'))
const qr=h.load('frontend/src/features/library/ShareQr.tsx');const qrTree=h.render(qr.ShareQr,{target:t,day:'2026-09-16',hall:'1관',title:memory.title},true);ok(toHtml(qrTree).includes('공유·QR'))
const root=path.resolve(__dirname,'../..'),pub=fs.readFileSync(path.join(root,'frontend/src/features/catalog/CatalogPublicPage.tsx'),'utf8'),map=fs.readFileSync(path.join(root,'frontend/src/features/floorplan/InteractiveFloorPlans.tsx'),'utf8')
ok(pub.includes('savedParticipants'));ok(pub.includes('x.target.participantId!==null'));ok(pub.includes("x.visitedDays.includes(state.day)"));ok(map.includes('onlySaved||links(s).some'));ok(map.includes("linkedIds={plan.shapes.filter"));
const provider=fs.readFileSync(path.join(root,'frontend/src/features/library/LibraryProvider.tsx'),'utf8');ok(provider.includes('state.owner===owner'));ok(provider.includes('epoch.current===session'));ok(provider.includes("result.result==='NOTE_CONFLICT'"));ok(provider.includes('JSON.stringify(current)===JSON.stringify(g)'));
console.log(`PASS ${n} source UI/markup and integration contract conditions (mock hooks/static JSX, not React DOM).`)
